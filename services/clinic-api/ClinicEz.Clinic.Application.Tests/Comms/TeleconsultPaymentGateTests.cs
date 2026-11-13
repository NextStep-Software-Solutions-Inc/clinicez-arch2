using System;
using System.Text.Json;
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
    public async Task AdmitPatient_WhenPatientHasActiveYakapEnlistment_DoesNotAutoExempt_ThrowsTeleconsultPaymentRequiredException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var scheduledAt = new DateTime(2026, 10, 26, 14, 0, 0, DateTimeKind.Utc);

        var patient = new Patient
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

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 15),
            ValidUntil = new DateOnly(2026, 12, 31),
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

        // Act & Assert per F6:
        // Active Yakap is informational and must not auto-exempt prepaid appointments.
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
        ex.Which.AppointmentId.Should().Be(appointmentId);
        appointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
    }

    [Fact]
    public async Task BillingPaymentConfirmed_WhenTeleconsultInvoiceSettled_UpdatesAppointmentAndEmitsPaymentCleared()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var publisher = Substitute.For<IInteropPublisher>();
        var recipientResolver = new ClinicRecipientResolver(context, NullLogger<ClinicRecipientResolver>.Instance);

        context.Settings.Add(new FacilitySettings
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
        var audit = await context.AuditEntries
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
        unauthorizedContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);

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
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var nonExistentPatientId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = nonExistentPatientId, // Patient does not exist in Patient table
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
    public async Task AdmitPatient_WhenEmergencyOverrideReasonCodeIsUnrecognized_DefaultsToStaffOverrideAndAdmits()
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

        // Act & Assert per F7: Unrecognized reason codes default to STAFF-OVERRIDE.
        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, overrideDto), CancellationToken.None);
        result.Should().NotBeNull();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        result.IsEmergencyOverride.Should().BeTrue();
        appointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        appointment.EmergencyOverrideReasonCode.Should().Be("STAFF-OVERRIDE");
    }

    [Fact]
    public async Task RecordPaymentCommand_WhenTeleconsultInvoiceSettled_UpdatesAppointmentAndEmitsPaymentCleared()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Emilio Jacinto",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = callId,
            InvoiceId = invoiceId
        };
        context.Appointments.Add(appointment);

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-20261113-REC01",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = appointmentId,
            PatientId = appointment.PatientId,
            PatientName = appointment.PatientName,
            GrossAmount = 400.00m,
            NetAmount = 400.00m,
            BalanceDue = 400.00m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft,
            InvoiceDate = DateTime.UtcNow
        };
        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        var handler = new RecordPaymentCommandHandler(
            invoiceRepo, paymentRepo, appointmentRepo, uow, _clinicContext, publisher);

        var command = new RecordPaymentCommand(
            InvoiceId: invoiceId,
            Amount: 400.00m,
            Method: PaymentMethod.Cash,
            ReferenceNumber: "REC-998811",
            Notes: "Full payment at clinic cashier desk");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Status.Should().Be(InvoiceStatus.Paid);
        result.BalanceDue.Should().Be(0m);

        var updatedAppointment = await context.Appointments.FindAsync(appointmentId);
        updatedAppointment!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        updatedAppointment.PaidAmount.Should().Be(400.00m);
        updatedAppointment.PaymentReceiptNumber.Should().NotBeNullOrWhiteSpace();
        updatedAppointment.PaymentMethod.Should().Be("Cash");

        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.CallId == callId &&
                p.InvoiceId == invoiceId &&
                p.PaymentMethod == "Cash" &&
                !p.IsEmergencyOverride));
    }

    [Fact]
    public async Task AdmitPatient_WithEmergencyOverride_AuthorizedByStaffWithConsultationsWrite_Succeeds()
    {
        // Arrange: staff has ConsultationsWrite but lacks ConsultationsSign
        var staffContext = Substitute.For<IClinicContext>();
        staffContext.ClinicId.Returns(_clinicId);
        staffContext.TenantId.Returns(_tenantId);
        staffContext.StaffId.Returns(Guid.NewGuid());
        staffContext.StaffName.Returns("Nurse Teresa");
        staffContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);
        staffContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(staffContext);
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
            PatientName = "Patient Write Authority",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, staffContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: null,
            ReasonNote: "Urgent teleconsultation required for acute asthma flareup"
        );

        // Act
        var result = await handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, overrideDto), CancellationToken.None);

        // Assert
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        result.IsEmergencyOverride.Should().BeTrue();
        appointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        appointment.EmergencyOverrideReasonCode.Should().Be("STAFF-OVERRIDE");
    }

    [Fact]
    public async Task GetTeleconsultStatus_WhenPrepaidAndUnpaidWithYakap_ReturnsCanAdmitFalseAndInformationalYakap()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var patientId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAKAP-INFO",
            FirstName = "Leona",
            LastName = "Florentino",
            DateOfBirth = new DateOnly(1985, 4, 19),
            ContactNumber = "09170001122"
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
        context.Patients.Add(patient);

        var appointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            ScheduledAt = new DateTime(2026, 11, 13, 10, 0, 0, DateTimeKind.Utc),
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            InvoiceId = invoiceId,
            CallId = Guid.NewGuid()
        };
        context.Appointments.Add(appointment);

        var settings = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Yakap Test Facility",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly",
            TeleconsultRecordingConsentRequired = true
        };
        context.Settings.Add(settings);
        await context.SaveChangesAsync();

        var handler = new GetTeleconsultStatusQueryHandler(
            appointmentRepo, patientRepo, _clinicContext, settingsRepo, null, invoiceRepo);

        // Act
        var result = await handler.Handle(new GetTeleconsultStatusQuery(appointmentId), CancellationToken.None);

        // Assert
        result.CanAdmit.Should().BeFalse();
        result.HasActiveYakapEnlistment.Should().BeTrue();
        result.IsYakapExempt.Should().BeTrue(); // alias property
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        result.InvoiceId.Should().Be(invoiceId);
        result.RecordingPolicy.Should().Be("WorkspaceVaultOnly");
        result.RecordingConsentRequired.Should().BeTrue();
    }

    [Fact]
    public async Task CreateAppointment_WhenTeleconsultation_InfersModality_AssignsCallId_CreatesLinkedInvoice()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var settings = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Teleconsultation Inference Clinic",
            TeleconsultPaymentPolicy = "Prepaid",
            TeleconsultDefaultFee = 450.00m,
            CashierMode = "CashierCounter"
        };
        context.Settings.Add(settings);
        await context.SaveChangesAsync();

        var handler = new CreateAppointmentCommandHandler(
            appointmentRepo, uow, _clinicContext, null, publisher, settingsRepo, invoiceRepo);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Graciano Lopez Jaena",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            ServiceType: "Teleconsultation"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.AppointmentType.Should().Be(AppointmentType.Teleconsult);
        result.IsTeleconsult.Should().BeTrue();
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        result.CallId.Should().NotBeNull();
        result.InvoiceId.Should().NotBeNull();

        var appointmentInDb = await context.Appointments.FindAsync(result.Id);
        appointmentInDb!.IsTeleconsult.Should().BeTrue();
        appointmentInDb.CallId.Should().NotBeNull();
        appointmentInDb.InvoiceId.Should().NotBeNull();

        var invoiceInDb = await context.Invoices.FindAsync(appointmentInDb.InvoiceId!.Value);
        invoiceInDb.Should().NotBeNull();
        invoiceInDb!.GrossAmount.Should().Be(450.00m);
        invoiceInDb.Status.Should().Be(InvoiceStatus.Draft);

        publisher.Received(1).Enqueue(
            InteropTypes.BillingInvoiceRequested,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            invoiceInDb.Id,
            Arg.Any<BillingInvoiceRequestedPayload>());
    }

    [Fact]
    public async Task AppointmentBookedHandler_WhenTeleconsult_AssignsCallId_CreatesLinkedInvoice_AndEnqueuesBillingRequest()
    {
        // Arrange
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-booked-teleconsult";
        var settings = MessagingTestKit.SeedClinic(db, clinicId, tenantId);
        settings.TeleconsultPaymentPolicy = "Prepaid";
        settings.TeleconsultDefaultFee = 450.00m;
        settings.CashierMode = "CashierCounter";
        await db.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var recipient = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new AppointmentBookedHandler(db, recipient, publisher, NullLogger<AppointmentBookedHandler>.Instance);

        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var booked = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            TenantId = tenantId,
            AppointmentType = "Teleconsult",
            PreferredDate = new DateOnly(2026, 11, 20),
            PreferredTime = "14:00",
            Reason = "Teleconsultation follow-up",
            Notes = "Virtual consult requested",
            CreatedAt = DateTime.UtcNow
        };

        var context = MessagingTestKit.Delivered(
            InteropTypes.PatientAppointmentBooked,
            Party.ForPatient(patientId.ToString()),
            MessagingTestKit.ClinicParty(tenantId, clinicId),
            draftId,
            booked);

        // Act
        await handler.HandleAsync(booked, context, CancellationToken.None);
        await db.SaveChangesAsync();

        // Assert
        var appt = await db.Appointments.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.DraftId == draftId);
        appt.Should().NotBeNull();
        appt!.AppointmentType.Should().Be(AppointmentType.Teleconsult);
        appt.IsTeleconsult.Should().BeTrue();
        appt.CallId.Should().NotBeNull();
        appt.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        appt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        appt.InvoiceId.Should().NotBeNull();

        var invoice = await db.Invoices.IgnoreQueryFilters().FirstOrDefaultAsync(i => i.Id == appt.InvoiceId!.Value);
        invoice.Should().NotBeNull();
        invoice!.GrossAmount.Should().Be(450.00m);
        invoice.Status.Should().Be(InvoiceStatus.Draft);

        publisher.Received().Enqueue(
            InteropTypes.BillingInvoiceRequested,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            invoice.Id,
            Arg.Any<BillingInvoiceRequestedPayload>());
    }
}
