using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.Teleconsult.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Comms;

public sealed class TeleconsultPaymentGateTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-gate-test";
    private readonly IClinicContext _clinicContext;

    public TeleconsultPaymentGateTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Dr. Ramon Santos");
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
    }

    [Fact]
    public async Task AdmitPatient_WhenPrepaidAndUnpaid_ThrowsTeleconsultPaymentRequiredException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Juan Luna",
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
        TeleconsultPaymentRequiredException.ErrorCode.Should().Be("payment_required");
        ex.Which.AppointmentId.Should().Be(appointmentId);
    }

    [Fact]
    public async Task AdmitPatient_WhenPatientHasActiveYakapEnlistment_AutoExemptsAndAdmits()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var scheduledAt = new DateTime(2026, 10, 26, 14, 0, 0, DateTimeKind.Utc);

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAKAP-01",
            FirstName = "Gabriela",
            LastName = "Silang",
            DateOfBirth = new DateOnly(1988, 3, 19),
            ContactNumber = "09181234567",
            PhilHealthNumber = "12-345678901-2"
        };

        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-15",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active
        });

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Gabriela Silang",
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
        result.Should().NotBeNull();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        result.IsEmergencyOverride.Should().BeFalse();
        result.RoomName.Should().StartWith("call-");

        // Verify appointment was updated to Exempt
        appointment.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        appointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        appointment.PaymentMethod.Should().Be("PhilHealthKonsulta");
        appointment.Status.Should().Be(AppointmentStatus.InConsultation);
    }

    [Fact]
    public async Task BillingPaymentConfirmed_WhenTeleconsultInvoiceSettled_UpdatesAppointmentAndEmitsPaymentCleared()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var publisher = Substitute.For<IInteropPublisher>();
        var recipientResolver = new ClinicRecipientResolver(context, NullLogger<ClinicRecipientResolver>.Instance);

        context.ClinicSettings.Add(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Health Clinic"
        });

        var callId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();
        var correlationId = invoiceId;

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Apolinario Mabini",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Santos",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = callId,
            InvoiceId = invoiceId,
            InvoiceRequestId = invoiceId
        };

        var invoice = new Invoice
        {
            Id = invoiceId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            InvoiceNumber = "INV-2026-0001",
            AppointmentId = appointmentId,
            PatientId = appointment.PatientId,
            PatientName = appointment.PatientName,
            GrossAmount = 600.00m,
            NetAmount = 600.00m,
            BalanceDue = 600.00m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft
        };

        context.Appointments.Add(appointment);
        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        var handler = new BillingPaymentConfirmedHandler(
            context, recipientResolver, publisher, NullLogger<BillingPaymentConfirmedHandler>.Instance);

        var payload = new BillingPaymentConfirmedPayload
        {
            InvoiceRequestId = invoiceId,
            InvoiceId = invoiceId,
            SourceType = "Teleconsult",
            SourceId = appointmentId,
            AmountDue = 600.00m,
            AmountPaid = 600.00m,
            ReceiptNumber = "OR-987654",
            PaymentMethod = "GCash",
            PaidAtUtc = DateTime.UtcNow,
            FullyPaid = true
        };

        var from = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic, service: InteropServices.Billing);
        var to = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic);
        var envelope = InteropEnvelope.Create(
            type: InteropTypes.BillingPaymentConfirmed,
            from: from,
            to: to,
            correlationId: correlationId,
            payload: payload
        );
        var messageContext = new InteropMessageContext(envelope);

        // Act
        await handler.HandleAsync(payload, messageContext, CancellationToken.None);

        // Assert
        appointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        appointment.PaidAmount.Should().Be(600.00m);
        appointment.PaymentReceiptNumber.Should().Be("OR-987654");
        appointment.PaymentMethod.Should().Be("GCash");

        // Verify comms.call.payment.cleared was enqueued to Interop Hub
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Is<Party>(p => p.FacilityId == _clinicId.ToString()),
            Arg.Is<Party>(p => p.Service == InteropServices.Comms),
            callId,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.CallId == callId &&
                p.InvoiceId == invoiceId &&
                p.PaymentMethod == "GCash" &&
                !p.IsEmergencyOverride)
        );
    }

    [Fact]
    public async Task AdmitPatient_WithEmergencyClinicalOverride_RecordsWormAuditAndEmitsPaymentCleared()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Emilio Aguinaldo",
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
            ReasonCode: "EMERG-03",
            ReasonNote: "Acute anaphylactic distress, urgent teleconsultation triage required immediately"
        );

        // Act
        var result = await handler.Handle(
            new AdmitTeleconsultPatientCommand(appointmentId, overrideDto),
            CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.IsEmergencyOverride.Should().BeTrue();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);

        // Verify appointment fields updated
        appointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        appointment.IsEmergencyOverride.Should().BeTrue();
        appointment.EmergencyOverrideReasonCode.Should().Be("EMERG-03");
        appointment.EmergencyOverrideDoctorName.Should().Be("Dr. Ramon Santos");

        // Verify immutable WORM audit entry was persisted in ClinicAuditEntries
        var audit = await context.ClinicAuditEntries
            .FirstOrDefaultAsync(a => a.Action == "teleconsult.admission.emergency_override");
        audit.Should().NotBeNull();
        audit!.Category.Should().Be(ClinicAuditCategories.Clinical);
        audit.Severity.Should().Be(ClinicAuditSeverities.Emergency);
        audit.Description.Should().Contain("[EMERG-03]");

        // Verify comms.call.payment.cleared was emitted with IsEmergencyOverride = true
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Is<Party>(p => p.FacilityId == _clinicId.ToString()),
            Arg.Is<Party>(p => p.Service == InteropServices.Comms),
            appointment.CallId!.Value,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.CallId == appointment.CallId.Value &&
                p.IsEmergencyOverride &&
                p.OverrideReason!.Contains("EMERG-03"))
        );
    }

    [Fact]
    public async Task AdmitPatient_WithEmergencyOverride_LackingPermission_ThrowsForbiddenException()
    {
        // Arrange
        var unauthorizedContext = Substitute.For<IClinicContext>();
        unauthorizedContext.ClinicId.Returns(_clinicId);
        unauthorizedContext.TenantId.Returns(_tenantId);
        unauthorizedContext.StaffId.Returns(Guid.NewGuid());
        unauthorizedContext.StaffName.Returns("Receptionist Staff");
        unauthorizedContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(unauthorizedContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            DoctorId = Guid.NewGuid(),
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
            appointmentRepo, patientRepo, auditRepo, uow, unauthorizedContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: "EMERG-01",
            ReasonNote: "Emergency override attempted by non-clinician"
        );

        // Act & Assert
        var act = () => handler.Handle(
            new AdmitTeleconsultPatientCommand(appointmentId, overrideDto),
            CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Only attending clinicians*");
    }

    [Fact]
    public async Task AdmitPatient_WithEmergencyOverride_TooShortReason_ThrowsBadRequestException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
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

        // Too short justification note (< 5 characters)
        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: "EMERG-01",
            ReasonNote: "bad"
        );

        // Act & Assert
        var act = () => handler.Handle(
            new AdmitTeleconsultPatientCommand(appointmentId, overrideDto),
            CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*minimum 5 characters*");
    }

    [Fact]
    public async Task AdmitPatient_WhenPatientNotInDb_DoesNotThrowNullReferenceException_AndEnforcesPrepaymentGate()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var nonExistentPatientId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = nonExistentPatientId, // Patient does not exist in ClinicPatient table
            PatientName = "Unknown Patient",
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

        // Act & Assert: Must NOT throw NullReferenceException; should hit prepayment gate
        var act = () => handler.Handle(
            new AdmitTeleconsultPatientCommand(appointmentId),
            CancellationToken.None);

        await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
    }

    [Fact]
    public async Task AdmitPatient_WhenEmergencyOverrideReasonCodeIsUnrecognized_ThrowsBadRequestException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Apolinario Mabini",
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
            ReasonCode: "INVALID-CODE-999",
            ReasonNote: "Valid clinical note with sufficient length"
        );

        // Act & Assert: Must throw BadRequestException for unrecognized statutory reason code
        var act = () => handler.Handle(
            new AdmitTeleconsultPatientCommand(appointmentId, overrideDto),
            CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not a recognized statutory reason code*");
    }
}
