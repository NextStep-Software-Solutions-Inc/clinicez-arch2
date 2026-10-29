using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.Teleconsult.Queries;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Facility;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Comms;

/// <summary>
/// Empirical Adversarial Verification Suite for Challenger 2 (Milestone M4):
/// 1. Prepayment Gate Bypass Attacks (unpaid prepaid -> 409, partial payment -> 409, non-teleconsult -> 400).
/// 2. PhilHealth Konsulta YAKAP Exemption Integrity (active enlistment -> 200 exempt, expired/transferred -> 409 denied).
/// 3. Emergency Clinical Override Fraud Attacks (unauthorized role -> 403, empty/short reason -> 400, valid override -> admitted + WORM).
/// 4. WORM Immutability Attack on Emergency Override & Purge Logs (mutation/deletion throws InvalidOperationException).
/// 5. Dual-Consent Rejection & Upload Block (rejection -> Blocked, segment upload -> 403 blocked, WORM audit).
/// 6. Medico-Legal Hold Immunity (expired session under legal hold skipped by sweeper, release allows purge).
/// </summary>
public sealed class ChallengerCommsVaultAndPaymentGateTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-challenger-m4";
    private readonly IClinicContext _clinicContext;

    public ChallengerCommsVaultAndPaymentGateTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Dr. Ramon Santos");
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.SettingsManage).Returns(true);
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    #region 1. Prepayment Gate Bypass Attacks

    [Fact]
    public async Task Attack1A_UnpaidPrepaidPatient_ThrowsTeleconsultPaymentRequiredException_409()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Juan De La Cruz",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Santos",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            PaidAmount = null
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
        ex.Which.AppointmentId.Should().Be(appointmentId);
        ex.Which.AmountDue.Should().Be(400.00m);
        TeleconsultPaymentRequiredException.ErrorCode.Should().Be("payment_required");
    }

    [Fact]
    public async Task Attack1B_PartialPaymentRecorded_StillThrowsPaymentRequiredException_409()
    {
        // Arrange: Patient paid ₱200 of ₱400 at cashier, leaving balance due. PaymentStatus remains Pending.
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Maria Makiling",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Santos",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending, // Partial payment does NOT clear prepayment gate!
            PaidAmount = 200.00m
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert: Admission must strictly be blocked until full payment
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
        ex.Which.AppointmentId.Should().Be(appointmentId);
        ex.Which.AmountDue.Should().Be(200.00m);
        TeleconsultPaymentRequiredException.ErrorCode.Should().Be("payment_required");
    }

    [Fact]
    public async Task Attack1C_NonTeleconsultAppointment_ThrowsBadRequestException_400()
    {
        // Arrange: In-person appointment submitted to teleconsult admission endpoint
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "In-Person Patient",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Santos",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.InPerson, // NOT teleconsult
            ServiceType = "General Consultation",
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Appointment is not a teleconsultation*");
    }

    [Fact]
    public async Task Attack1D_SoftDeletedAppointment_ThrowsNotFoundException_404()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Deleted Patient",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            IsDeleted = true // Soft deleted!
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    #endregion

    #region 2. PhilHealth Konsulta YAKAP Exemption Integrity

    [Fact]
    public async Task Attack2A_ActiveYakapEnlistment_AutoExemptsAndAdmits()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var scheduledAt = new DateTime(2026, 10, 26, 10, 0, 0, DateTimeKind.Utc);

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAKAP-ACTIVE",
            FirstName = "Teresa",
            LastName = "Magbanua",
            DateOfBirth = new DateOnly(1980, 11, 4),
            ContactNumber = "09171112233",
            PhilHealthNumber = "12-123456789-0"
        };

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active
        });

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Teresa Magbanua",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Santos",
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        context.Patients.Add(patient);
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act
        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);

        // Assert
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        result.IsEmergencyOverride.Should().BeFalse();
        appointment.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        appointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        appointment.PaymentMethod.Should().Be("PhilHealthKonsulta");
        appointment.Status.Should().Be(AppointmentStatus.InConsultation);
    }

    [Fact]
    public async Task Attack2B_ExpiredYakapEnlistment_AutoExemptionDenied_ThrowsPaymentRequiredException()
    {
        // Arrange: Patient enlistment expired on 2025-12-31; appointment is on 2026-10-26.
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var scheduledAt = new DateTime(2026, 10, 26, 10, 0, 0, DateTimeKind.Utc);

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAKAP-EXPIRED",
            FirstName = "Melchora",
            LastName = "Aquino",
            DateOfBirth = new DateOnly(1970, 1, 6),
            ContactNumber = "09174445566",
            PhilHealthNumber = "12-999888777-1"
        };

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31), // EXPIRED!
            Status = YakapEnlistmentStatus.Expired
        });

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Melchora Aquino",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        context.Patients.Add(patient);
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert: Expired enlistment must NOT grant exemption and must fall back to 409 payment_required
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
        ex.Which.AppointmentId.Should().Be(appointmentId);
    }

    [Fact]
    public async Task Attack2C_TransferredYakapEnlistment_AutoExemptionDenied_ThrowsPaymentRequiredException()
    {
        // Arrange: Patient enlistment was transferred to another RHU/hospital facility
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var scheduledAt = new DateTime(2026, 10, 26, 10, 0, 0, DateTimeKind.Utc);

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAKAP-TRANSFERRED",
            FirstName = "Gregoria",
            LastName = "De Jesus",
            ContactNumber = "09177778899"
        };

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Transferred // TRANSFERRED!
        });

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Gregoria De Jesus",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        context.Patients.Add(patient);
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
    }

    [Fact]
    public async Task Attack2D_FutureYakapEnlistment_AutoExemptionDenied_ThrowsPaymentRequiredException()
    {
        // Arrange: Patient enlistment starts in the future (e.g. appointment 2026-05-01, enlistment begins 2026-06-01)
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var scheduledAt = new DateTime(2026, 5, 1, 10, 0, 0, DateTimeKind.Utc);

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAKAP-FUTURE",
            FirstName = "Marcelo",
            LastName = "Del Pilar",
            ContactNumber = "09172223344"
        };

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 6, 1), // Enlisted after encounter date
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active
        });

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Marcelo Del Pilar",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        context.Patients.Add(patient);
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
    }

    [Fact]
    public async Task Attack2E_PatientWithNoYakapData_AutoExemptionDenied_ThrowsPaymentRequiredException()
    {
        // Arrange: Patient has empty CustomFields
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-NO-YAKAP",
            FirstName = "Juan",
            LastName = "Ponce",
            ContactNumber = "09173334455",
            CustomFields = new Dictionary<string, object?>() // Empty dictionary
        };

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Juan Ponce",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        context.Patients.Add(patient);
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
    }

    #endregion

    #region 3. Emergency Clinical Override Fraud Attacks

    [Fact]
    public async Task Attack3A_NonDoctorRole_ThrowsForbiddenException_403()
    {
        // Arrange: Nurse or receptionist lacks ConsultationsSign permission
        var unauthorizedContext = Substitute.For<IClinicContext>();
        unauthorizedContext.ClinicId.Returns(_clinicId);
        unauthorizedContext.TenantId.Returns(_tenantId);
        unauthorizedContext.StaffId.Returns(Guid.NewGuid());
        unauthorizedContext.StaffName.Returns("Nurse Joy");
        unauthorizedContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(unauthorizedContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient in Need",
            DoctorId = Guid.NewGuid(),
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, unauthorizedContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: "EMERG-01",
            ReasonNote: "Immediate resuscitation or emergency teleconsult needed"
        );

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, overrideDto), CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Only attending clinicians*");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task Attack3B_DoctorEmptyOrNullReasonCode_ThrowsBadRequestException_400(string? emptyReasonCode)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient in Need",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: emptyReasonCode!,
            ReasonNote: "Substantive clinical justification provided here"
        );

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, overrideDto), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Emergency override reason code is mandatory*");
    }

    [Theory]
    [InlineData("")]
    [InlineData("ok")]
    [InlineData("stat")]
    [InlineData(" 123 ")]
    public async Task Attack3C_DoctorReasonNoteLessThan5Chars_ThrowsBadRequestException_400(string shortNote)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient in Need",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: "EMERG-02",
            ReasonNote: shortNote
        );

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, overrideDto), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*minimum 5 characters*");
    }

    [Fact]
    public async Task Attack3D_ValidDoctorEmergencyOverride_AdmitsAndRecordsWormAuditAndPublishesEvent()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Francisco Dagohoy",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Santos",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: "EMERG-05",
            ReasonNote: "Acute severe chest pain with suspected unstable angina requiring immediate clinical assessment"
        );

        // Act
        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, overrideDto), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.IsEmergencyOverride.Should().BeTrue();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        result.RoomName.Should().StartWith("call-");

        // Verify appointment fields
        appointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        appointment.IsEmergencyOverride.Should().BeTrue();
        appointment.EmergencyOverrideReasonCode.Should().Be("EMERG-05");
        appointment.EmergencyOverrideDoctorName.Should().Be("Dr. Ramon Santos");
        appointment.Status.Should().Be(AppointmentStatus.InConsultation);

        // Verify WORM audit record in ClinicAuditEntries
        var audit = await context.AuditEntries
            .FirstOrDefaultAsync(a => a.Action == "teleconsult.admission.emergency_override");
        audit.Should().NotBeNull();
        audit!.Category.Should().Be(ClinicAuditCategories.Clinical);
        audit.Severity.Should().Be(ClinicAuditSeverities.Emergency);
        audit.Description.Should().Contain("[EMERG-05]");

        // Verify interop message comms.call.payment.cleared enqueued
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Is<Party>(p => p.FacilityId == _clinicId.ToString()),
            Arg.Is<Party>(p => p.Service == InteropServices.Comms),
            appointment.CallId!.Value,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.CallId == appointment.CallId.Value &&
                p.IsEmergencyOverride &&
                p.OverrideReason!.Contains("EMERG-05"))
        );
    }

    #endregion

    #region 4. WORM Immutability Attack on Emergency Override & Purge Logs

    [Fact]
    public async Task Attack4A_EmergencyOverrideAuditEntry_MutationOrDeletion_ThrowsInvalidOperationException()
    {
        // Arrange: Generate an emergency override audit entry through the actual handler
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Audit Target Patient",
            DoctorId = _clinicContext.StaffId!.Value,
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        await handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, new EmergencyOverrideDto(
            ReasonCode: "EMERG-09",
            ReasonNote: "Suspected stroke triage requiring immediate consultation"
        )), CancellationToken.None);

        var audit = await context.AuditEntries
            .FirstAsync(a => a.Action == "teleconsult.admission.emergency_override");

        // Act & Assert 1: Tampering / Mutation Attack
        audit.Description = "Tampered emergency description to erase audit trail";
        var mutateAct = () => context.SaveChangesAsync();
        await mutateAct.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*AuditEntry is append-only (WORM)*");

        // Act & Assert 2: Deletion Attack
        context.Entry(audit).State = EntityState.Unchanged;
        context.AuditEntries.Remove(audit);
        var deleteAct = () => context.SaveChangesAsync();
        await deleteAct.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*AuditEntry is append-only (WORM)*");
    }

    [Fact]
    public async Task Attack4B_RecordingPurgeAuditEntry_MutationOrDeletion_ThrowsInvalidOperationException()
    {
        // Arrange: Run retention sweeper to produce a real purge audit entry
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var storage = Substitute.For<IClinicStorageService>();

        var services = new ServiceCollection();
        services.AddSingleton(context);
        services.AddSingleton(storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        var sessionId = Guid.NewGuid();
        var expiredSession = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            PatientName = "Purge Target",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Santos",
            ConsentStatus = "Consented",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly",
            RetentionPolicyDays = 30,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(-5),
            IsLegalHold = false
        };
        context.TeleconsultRecordingSessions.Add(expiredSession);
        await context.SaveChangesAsync();

        // Run sweeper to purge and create WORM audit entry
        var purgedCount = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);
        purgedCount.Should().Be(1);

        var purgeAudit = await context.AuditEntries
            .FirstAsync(a => a.Action == "teleconsult.recording.purged");

        // Act & Assert 1: Attacker attempts to mutate purge log
        purgeAudit.Description = "Attacker erased purge details";
        var mutateAct = () => context.SaveChangesAsync();
        await mutateAct.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*AuditEntry is append-only (WORM)*");

        // Act & Assert 2: Attacker attempts to delete purge log
        context.Entry(purgeAudit).State = EntityState.Unchanged;
        context.AuditEntries.Remove(purgeAudit);
        var deleteAct = () => context.SaveChangesAsync();
        await deleteAct.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*AuditEntry is append-only (WORM)*");
    }

    #endregion

    #region 5. Dual-Consent Rejection & Upload Block

    [Fact]
    public async Task Attack5A_PatientDecline_LocksSessionInBlockedState_AndRejectsSegmentUploadWith403()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var segmentRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSegment>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();

        context.Settings.Add(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Health Clinic",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly",
            TeleconsultRecordingRetentionDays = 60
        });

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-CONSENT-DECLINE",
            FirstName = "Leonor",
            LastName = "Rivera",
            ContactNumber = "09176667788"
        };
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        var consentHandler = new ConsentCommandHandler(
            settingsRepo, sessionRepo, patientRepo, staffRepo, auditRepo,
            uow, _clinicContext, NullLogger<ConsentCommandHandler>.Instance);

        var callId = Guid.NewGuid();
        var session = await consentHandler.Handle(
            new RequestRecordingConsentCommand(callId, patient.Id, _clinicContext.StaffId!.Value),
            CancellationToken.None);

        session.RecordingState.Should().Be("PendingConsent");
        session.ConsentStatus.Should().Be("ConsentPending");

        // Act 1: Patient declines recording consent
        var rejectedSession = await consentHandler.Handle(
            new SubmitPatientConsentCommand(session.Id, Approved: false, RejectionReason: "Patient strictly refuses video recording"),
            CancellationToken.None);

        // Assert 1: State is locked in Blocked / Rejected
        rejectedSession.RecordingState.Should().Be("Blocked");
        rejectedSession.ConsentStatus.Should().Be("Rejected");

        // Assert 2: WORM audit log written
        var auditEntry = await context.AuditEntries
            .FirstOrDefaultAsync(a => a.Action == "teleconsult.recording.consent.rejected");
        auditEntry.Should().NotBeNull();
        auditEntry!.Severity.Should().Be(ClinicAuditSeverities.Urgent);
        auditEntry.Description.Should().Contain("Patient strictly refuses");

        // Act 2: Malicious client attempts to upload a recording chunk anyway
        var uploadHandler = new UploadRecordingSegmentCommandHandler(
            settingsRepo, sessionRepo, segmentRepo, uow, _clinicContext, storage,
            NullLogger<UploadRecordingSegmentCommandHandler>.Instance);

        var uploadAct = () => uploadHandler.Handle(new UploadRecordingSegmentCommand(
            SessionId: session.Id,
            SegmentIndex: 0,
            DurationMs: 5000,
            StorageKey: "vault/illegal-chunk-0.cez",
            SizeBytes: 1024,
            Sha256Checksum: "abc123hash",
            IvBase64: "ivbase64",
            TagBase64: "tagbase64"), CancellationToken.None);

        // Assert 3: Upload strictly rejected with HTTP 403 CONSENT_REJECTED_RECORDING_BLOCKED
        await uploadAct.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*CONSENT_REJECTED_RECORDING_BLOCKED*");
    }

    #endregion

    #region 6. Medico-Legal Hold Immunity

    [Fact]
    public async Task Attack6A_ExpiredSessionUnderLegalHold_SweeperBypasses_AndReleasingAllowsPurge()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();

        var services = new ServiceCollection();
        services.AddSingleton(context);
        services.AddSingleton(storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        var sessionId = Guid.NewGuid();
        var expiredDate = DateTime.UtcNow.AddDays(-20); // Expired 20 days ago

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            PatientName = "Legal Hold Subject",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Santos",
            ConsentStatus = "Consented",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly",
            RetentionPolicyDays = 30,
            ExpiresAtUtc = expiredDate,
            IsLegalHold = true, // MEDICO-LEGAL HOLD ACTIVE!
            LegalHoldReason = "Pending trial subpoena Case No. 2026-CR-0012"
        };

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            SessionId = sessionId,
            SegmentIndex = 0,
            DurationMs = 15000,
            StorageKey = "vault/case-0012/chunk0.cez",
            SizeBytes = 4096,
            Sha256Checksum = "checksum0012",
            IvBase64 = "iv",
            TagBase64 = "tag"
        };

        context.TeleconsultRecordingSessions.Add(session);
        context.TeleconsultRecordingSegments.Add(segment);
        await context.SaveChangesAsync();

        // Act 1: Run sweeper while legal hold is active
        var sweepResult1 = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert 1: Sweeper skips session completely; storage files untouched
        sweepResult1.Should().Be(0);
        session.IsPurged.Should().BeFalse();
        await storage.DidNotReceive().DeleteEncryptedFileAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());

        // Act 2: Administrator releases the medico-legal hold
        var legalHoldHandler = new LegalHoldCommandHandler(
            sessionRepo, auditRepo, uow, _clinicContext,
            NullLogger<LegalHoldCommandHandler>.Instance);

        var releasedResult = await legalHoldHandler.Handle(
            new ReleaseLegalHoldCommand(sessionId, "Case dismissed by court order"),
            CancellationToken.None);

        // Assert 2: Hold is released
        releasedResult.IsLegalHold.Should().BeFalse();
        session.IsLegalHold.Should().BeFalse();

        // Verify hold release audit entry was created
        var releaseAudit = await context.AuditEntries
            .FirstOrDefaultAsync(a => a.Action == "teleconsult.recording.legal_hold.released");
        releaseAudit.Should().NotBeNull();
        releaseAudit!.Outcome.Should().Be(ClinicAuditOutcomes.Success);

        // Act 3: Run retention sweeper again
        var sweepResult2 = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert 3: Recording purged, storage deleted, and WORM audit recorded
        sweepResult2.Should().Be(1);
        session.IsPurged.Should().BeTrue();
        session.PurgedBy.Should().Be("System.RetentionSweeper");

        await storage.Received(1).DeleteEncryptedFileAsync("vault/case-0012/chunk0.cez", Arg.Any<CancellationToken>());

        var purgeAudit = await context.AuditEntries
            .FirstOrDefaultAsync(a => a.Action == "teleconsult.recording.purged");
        purgeAudit.Should().NotBeNull();
        purgeAudit!.Outcome.Should().Be(ClinicAuditOutcomes.Success);
    }

    [Fact]
    public async Task Attack6B_ReleaseLegalHold_WithoutAdminPermission_ThrowsForbiddenException_403()
    {
        // Arrange
        var unauthorizedContext = Substitute.For<IClinicContext>();
        unauthorizedContext.ClinicId.Returns(_clinicId);
        unauthorizedContext.TenantId.Returns(_tenantId);
        unauthorizedContext.StaffId.Returns(Guid.NewGuid());
        unauthorizedContext.StaffName.Returns("Unauthorized Staff");
        unauthorizedContext.HasPermission(ClinicPermissions.SettingsManage).Returns(false);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(unauthorizedContext);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);

        var sessionId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            PatientName = "Hold Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Test",
            IsLegalHold = true,
            LegalHoldReason = "Active Hold"
        };
        context.TeleconsultRecordingSessions.Add(session);
        await context.SaveChangesAsync();

        var handler = new LegalHoldCommandHandler(
            sessionRepo, auditRepo, uow, unauthorizedContext,
            NullLogger<LegalHoldCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new ReleaseLegalHoldCommand(sessionId, "Attempted unauthorized release"), CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Only facility administrators can release medico-legal holds*");
    }

    #endregion
}
