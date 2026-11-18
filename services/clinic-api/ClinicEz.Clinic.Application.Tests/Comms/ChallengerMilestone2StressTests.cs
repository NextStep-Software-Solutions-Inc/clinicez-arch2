using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.Teleconsult.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Comms;

public sealed class ChallengerMilestone2StressTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-challenger-m2";
    private readonly IClinicContext _clinicContext;

    public ChallengerMilestone2StressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Dr. Jose Rizal");
        _clinicContext.StaffRole.Returns("Doctor");
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.AppointmentsManage).Returns(true);
    }

    private (ApplicationDbContext db, IUnitOfWork uow, Sieve.Services.ISieveProcessor sieve) CreateContext(IClinicContext? ctx = null)
    {
        return TestDbHelper.CreateTestContext(ctx ?? _clinicContext);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. ACTIVE YAKAP ENLISTMENT GATE & NON-MUTATION TESTS
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task YakapEnlistment_UnpaidPrepaidAppointment_IsStrictlyBlocked_AndNeverAutoMutatesPolicy()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var scheduledAt = DateTime.UtcNow.AddHours(1);
        var patientId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAKAP-CHALLENGE-01",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1863, 11, 30)
        };
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            EffectiveYear = scheduledAt.Year,
            EnlistmentDate = DateOnly.FromDateTime(scheduledAt.AddDays(-30)),
            ValidUntil = DateOnly.FromDateTime(scheduledAt.AddDays(335)),
            Status = YakapEnlistmentStatus.Active
        });

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Andres Bonifacio",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            Status = AppointmentStatus.Pending,
            CallId = Guid.NewGuid()
        };

        context.Patients.Add(patient);
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        // Check Query status: CanAdmit must be strictly false
        var queryHandler = new GetTeleconsultStatusQueryHandler(appointmentRepo, patientRepo, _clinicContext);
        var status = await queryHandler.Handle(new GetTeleconsultStatusQuery(appointment.Id), CancellationToken.None);

        status.HasActiveYakapEnlistment.Should().BeTrue("patient has active YAKAP coverage");
        status.CanAdmit.Should().BeFalse("unpaid prepaid appointment must NOT be admitted even with active YAKAP");
        status.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        status.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);

        // Attempt admission without override
        var admitHandler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var act = () => admitHandler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
        ex.Which.AppointmentId.Should().Be(appointment.Id);

        // Verify entity state remained completely unchanged (zero mutation)
        var refreshedAppointment = await context.Appointments.FindAsync(appointment.Id);
        refreshedAppointment!.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        refreshedAppointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        refreshedAppointment.AdmittedAtUtc.Should().BeNull();
        refreshedAppointment.Status.Should().Be(AppointmentStatus.Pending);
        publisher.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task YakapPatient_WhenStaffExplicitlySwitchesPolicyToExempt_AdmissionSucceeds()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var scheduledAt = DateTime.UtcNow.AddHours(2);
        var patientId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAKAP-CHALLENGE-02",
            FirstName = "Melchora",
            LastName = "Aquino",
            ContactNumber = "09179876543",
            DateOfBirth = new DateOnly(1812, 1, 6)
        };
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            EffectiveYear = scheduledAt.Year,
            EnlistmentDate = DateOnly.FromDateTime(scheduledAt.AddDays(-10)),
            ValidUntil = DateOnly.FromDateTime(scheduledAt.AddDays(355)),
            Status = YakapEnlistmentStatus.Active
        });

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Melchora Aquino",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid()
        };

        context.Patients.Add(patient);
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        // 1. Staff explicitly switches policy to Exempt
        var policyHandler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        var policyResult = await policyHandler.Handle(
            new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        policyResult.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        policyResult.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        policyResult.CanAdmit.Should().BeTrue();

        // 2. Admission now succeeds without override
        var admitHandler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var admission = await admitHandler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id), CancellationToken.None);
        admission.Should().NotBeNull();
        admission.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        admission.IsEmergencyOverride.Should().BeFalse();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. EMERGENCY OVERRIDE PERMISSIONS MATRIX
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task EmergencyOverride_StaffWithConsultationsWriteOnly_IsPermitted()
    {
        // Arrange: Staff has ConsultationsWrite but NOT ConsultationsSign
        var staffContext = Substitute.For<IClinicContext>();
        staffContext.ClinicId.Returns(_clinicId);
        staffContext.TenantId.Returns(_tenantId);
        staffContext.StaffId.Returns(Guid.NewGuid());
        staffContext.StaffName.Returns("Nurse Teresa");
        staffContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);
        staffContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);

        var (context, uow, sieve) = CreateContext(staffContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Emilio Aguinaldo",
            DoctorId = Guid.NewGuid(),
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid()
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, staffContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: null,
            ReasonNote: "Acute respiratory distress, urgent doctor consult needed");

        // Act
        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id, overrideDto), CancellationToken.None);

        // Assert
        result.IsEmergencyOverride.Should().BeTrue();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);

        var savedAudit = await context.AuditEntries.FirstOrDefaultAsync(a => a.TargetEntityId == appointment.Id.ToString());
        savedAudit.Should().NotBeNull();
        savedAudit!.ActorRole.Should().Be("Staff");
        savedAudit.Action.Should().Be("teleconsult.admission.emergency_override");
    }

    [Fact]
    public async Task EmergencyOverride_StaffWithConsultationsSignOnly_IsPermitted()
    {
        // Arrange: Doctor has ConsultationsSign but NOT ConsultationsWrite
        var doctorContext = Substitute.For<IClinicContext>();
        doctorContext.ClinicId.Returns(_clinicId);
        doctorContext.TenantId.Returns(_tenantId);
        doctorContext.StaffId.Returns(Guid.NewGuid());
        doctorContext.StaffName.Returns("Dr. Marcelo H. Del Pilar");
        doctorContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);
        doctorContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);

        var (context, uow, sieve) = CreateContext(doctorContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Marcelo Patient",
            DoctorId = doctorContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid()
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, doctorContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: "ACUTE-CARDIAC",
            ReasonNote: "Patient reporting sudden substernal chest pressure");

        // Act
        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id, overrideDto), CancellationToken.None);

        // Assert
        result.IsEmergencyOverride.Should().BeTrue();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);

        var savedAudit = await context.AuditEntries.FirstOrDefaultAsync(a => a.TargetEntityId == appointment.Id.ToString());
        savedAudit.Should().NotBeNull();
        savedAudit!.ActorRole.Should().Be("Doctor");
    }

    [Fact]
    public async Task EmergencyOverride_StaffWithNeitherPermission_StrictlyForbidden()
    {
        // Arrange: User with only AppointmentsManage or zero consultation perms
        var clerkContext = Substitute.For<IClinicContext>();
        clerkContext.ClinicId.Returns(_clinicId);
        clerkContext.TenantId.Returns(_tenantId);
        clerkContext.StaffId.Returns(Guid.NewGuid());
        clerkContext.StaffName.Returns("Clerk Maria");
        clerkContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);
        clerkContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);
        clerkContext.HasPermission(ClinicPermissions.AppointmentsManage).Returns(true);

        var (context, uow, sieve) = CreateContext(clerkContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Test Patient",
            DoctorId = Guid.NewGuid(),
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid()
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, clerkContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: "STAFF-OVERRIDE",
            ReasonNote: "Attempted override without consultation authority");

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id, overrideDto), CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*consultation authority*");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. REASON CODE ROBUSTNESS & DEFAULTING TO STAFF-OVERRIDE
    // ──────────────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("RANDOM_CUSTOM_CODE_12345")]
    [InlineData("NON_EXISTENT_REASON")]
    public async Task EmergencyOverride_PlainReasonNote_SucceedsWithNullEmptyWhitespaceOrArbitraryCodes(string? rawReasonCode)
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Gabriela Silang",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid()
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: rawReasonCode,
            ReasonNote: "High fever 39.8C with active convulsion, admitting immediately");

        // Act
        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id, overrideDto), CancellationToken.None);

        // Assert
        result.IsEmergencyOverride.Should().BeTrue();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);

        var updated = await context.Appointments.FindAsync(appointment.Id);
        updated!.EmergencyOverrideReasonCode.Should().Be("STAFF-OVERRIDE");
        updated.EmergencyOverrideReasonNote.Should().Be("High fever 39.8C with active convulsion, admitting immediately");

        // Assert publisher received CommsCallPaymentCleared
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            appointment.CallId!.Value,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.IsEmergencyOverride &&
                p.OverrideReason!.StartsWith("STAFF-OVERRIDE:") &&
                p.PaymentMethod == "EmergencyOverride")
        );
    }

    [Fact]
    public async Task EmergencyOverride_RecognizedReasonCode_IsPreserved()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid()
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: EmergencyOverrideReasonCodes.AcuteChestPain,
            ReasonNote: "Suspected NSTEMI based on remote monitoring ECG");

        // Act
        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id, overrideDto), CancellationToken.None);

        // Assert
        var updated = await context.Appointments.FindAsync(appointment.Id);
        updated!.EmergencyOverrideReasonCode.Should().Be(EmergencyOverrideReasonCodes.AcuteChestPain);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. REASON NOTE LENGTH VALIDATION (< 5 CHARS REJECTED)
    // ──────────────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("1234")]
    [InlineData("Four")]
    [InlineData("  Hi ")]
    public async Task EmergencyOverride_ShortOrEmptyNote_StrictlyRejectedWithBadRequest(string? shortNote)
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Antonio Luna",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid()
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: "STAFF-OVERRIDE",
            ReasonNote: shortNote);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id, overrideDto), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*minimum 5 characters*");
    }

    [Fact]
    public async Task EmergencyOverride_ExactlyFiveCharacters_Succeeds()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Diego Silang",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid()
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // 5 characters exactly: "Fever"
        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: null,
            ReasonNote: "Fever");

        // Act
        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id, overrideDto), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. POLICY SWITCH TO EXEMPT EMITS CommsCallPaymentCleared
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateTeleconsultPaymentPolicy_WhenSwitchedToExempt_EmitsCommsCallPaymentCleared()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var callId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Graciano Lopez Jaena",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = callId
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        // Act
        var result = await handler.Handle(
            new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        result.CanAdmit.Should().BeTrue();

        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.CallId == callId &&
                p.PaymentMethod == "PolicyExempt" &&
                !p.IsEmergencyOverride &&
                p.OverrideReason == null)
        );

        var audit = await context.AuditEntries.FirstOrDefaultAsync(a => a.TargetEntityId == appointment.Id.ToString());
        audit.Should().NotBeNull();
        audit!.Action.Should().Be("teleconsult.payment_policy.updated");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. POLICY SWITCH TO PREPAID: DRAFT INVOICE CREATION & DEDUPLICATION
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateTeleconsultPaymentPolicy_WhenSwitchedToPrepaid_CreatesDraftInvoiceIfNoneExists()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        context.Settings.Add(new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Central Clinic",
            TeleconsultDefaultFee = 550.00m
        });

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Lapu Lapu",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Postpaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid(),
            InvoiceId = null // No invoice initially
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        // Act
        var result = await handler.Handle(
            new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Prepaid), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.InvoiceId.Should().NotBeNull();

        var createdInvoice = await context.Invoices.Include(i => i.LineItems).FirstOrDefaultAsync(i => i.Id == result.InvoiceId!.Value);
        createdInvoice.Should().NotBeNull();
        createdInvoice!.AppointmentId.Should().Be(appointment.Id);
        createdInvoice.GrossAmount.Should().Be(550.00m);
        createdInvoice.BalanceDue.Should().Be(550.00m);
        createdInvoice.Status.Should().Be(InvoiceStatus.Draft);
        createdInvoice.LineItems.Should().ContainSingle(li => li.Category == "Teleconsultation" && li.UnitPrice == 550.00m);
    }

    [Fact]
    public async Task UpdateTeleconsultPaymentPolicy_WhenSwitchedToPrepaid_AvoidsDuplicateInvoiceIfOneAlreadyExists()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var existingInvoiceId = Guid.NewGuid();
        var existingInvoice = new Invoice
        {
            Id = existingInvoiceId,
            InvoiceNumber = "INV-20261113-EXIST1",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientName = "Panday Pira",
            GrossAmount = 400.00m,
            NetAmount = 400.00m,
            BalanceDue = 400.00m,
            Status = InvoiceStatus.Draft,
            InvoiceDate = DateTime.UtcNow
        };
        context.Invoices.Add(existingInvoice);

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Panday Pira",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt,
            CallId = Guid.NewGuid(),
            InvoiceId = existingInvoiceId,
            InvoiceRequestId = existingInvoiceId
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var initialInvoiceCount = await context.Invoices.CountAsync();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        // Act: switch from Exempt to Prepaid
        var result = await handler.Handle(
            new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Prepaid), CancellationToken.None);

        // Assert: InvoiceId remained the existing one, no new invoice was created
        result.InvoiceId.Should().Be(existingInvoiceId);
        var finalInvoiceCount = await context.Invoices.CountAsync();
        finalInvoiceCount.Should().Be(initialInvoiceCount, "switching to prepaid must NOT create duplicate invoice if one already exists");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. CASHIER CLEARANCE VIA RecordPaymentCommand
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task RecordPaymentCommand_WhenInvoiceSettled_UpdatesTeleconsultAppointmentAndEmitsPaymentCleared()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-20261113-CASH1",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientName = "Tandang Sora",
            AppointmentId = appointmentId,
            GrossAmount = 400.00m,
            NetAmount = 400.00m,
            BalanceDue = 400.00m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft,
            InvoiceDate = DateTime.UtcNow
        };

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Tandang Sora",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = callId,
            InvoiceId = invoiceId
        };

        context.Invoices.Add(invoice);
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new RecordPaymentCommandHandler(
            invoiceRepo, paymentRepo, appointmentRepo, uow, _clinicContext, publisher);

        // Act 1: Partial payment of 150m (Balance remains 250m)
        var partialResult = await handler.Handle(
            new RecordPaymentCommand(invoiceId, 150.00m, PaymentMethod.Cash), CancellationToken.None);

        partialResult.Status.Should().Be(InvoiceStatus.PartiallyPaid);
        var apptAfterPartial = await context.Appointments.FindAsync(appointmentId);
        apptAfterPartial!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending, "partial payment must not clear teleconsult gate");
        publisher.ReceivedCalls().Should().BeEmpty();

        // Act 2: Settle remaining 250m
        var finalResult = await handler.Handle(
            new RecordPaymentCommand(invoiceId, 250.00m, PaymentMethod.GCash, "GCASH-REF-8888"), CancellationToken.None);

        finalResult.Status.Should().Be(InvoiceStatus.Paid);

        var apptAfterFinal = await context.Appointments.FindAsync(appointmentId);
        apptAfterFinal!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        apptAfterFinal.PaidAmount.Should().Be(400.00m);
        apptAfterFinal.PaidAt.Should().NotBeNull();
        apptAfterFinal.PaymentReceiptNumber.Should().StartWith("OR-");
        apptAfterFinal.PaymentMethod.Should().Be("GCash");

        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.CallId == callId &&
                p.InvoiceId == invoiceId &&
                p.PaymentMethod == "GCash" &&
                !p.IsEmergencyOverride)
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. ADVERSARIAL EDGE CASES & BOUNDARIES
    // ──────────────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("Teleconsultation")]
    [InlineData("teleconsultation")]
    [InlineData("TELECONSULTATION")]
    [InlineData("Teleconsult")]
    [InlineData("teleconsult")]
    public async Task AppointmentCreation_InfersTeleconsult_AcrossVariedServiceTypeCasing(string serviceType)
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        context.Settings.Add(new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Inference Facility",
            TeleconsultPaymentPolicy = "Prepaid",
            TeleconsultDefaultFee = 500.00m,
            CashierMode = "CashierCounter"
        });
        await context.SaveChangesAsync();

        var handler = new CreateAppointmentCommandHandler(
            appointmentRepo, uow, _clinicContext, null, publisher, settingsRepo, invoiceRepo);

        var cmd = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Juan Luna",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            ServiceType: serviceType
        );

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.AppointmentType.Should().Be(AppointmentType.Teleconsult);
        result.IsTeleconsult.Should().BeTrue();
        result.CallId.Should().NotBeNull();
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        result.InvoiceId.Should().NotBeNull();
    }

    [Fact]
    public async Task AdmitTeleconsultPatient_WhenAppointmentIsNotTeleconsult_ThrowsBadRequest()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "InPerson Patient",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.InPerson,
            ServiceType = "General Consultation"
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointment.Id), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not a teleconsultation*");
    }

    [Fact]
    public async Task UpdatePaymentPolicy_WhenAppointmentIsNotTeleconsult_ThrowsBadRequest()
    {
        // Arrange
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "InPerson Patient",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.InPerson,
            ServiceType = "General Consultation"
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(
            new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not a teleconsultation*");
    }

    [Fact]
    public async Task TenantIsolation_ForeignClinicAppointment_ThrowsNotFound()
    {
        // Arrange: appointment belongs to different clinic
        var foreignClinicId = Guid.NewGuid();
        var (context, uow, sieve) = CreateContext();
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = foreignClinicId, // Other clinic!
            PatientId = Guid.NewGuid(),
            PatientName = "Foreign Patient",
            DoctorId = Guid.NewGuid(),
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(
            new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }
}
