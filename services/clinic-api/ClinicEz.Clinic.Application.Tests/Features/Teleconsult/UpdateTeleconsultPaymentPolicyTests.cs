using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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

namespace ClinicEz.Clinic.Application.Tests.Features.Teleconsult;

public sealed class UpdateTeleconsultPaymentPolicyTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-policy-test";
    private readonly IClinicContext _clinicContext;

    public UpdateTeleconsultPaymentPolicyTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Nurse Joy");
        _clinicContext.StaffRole.Returns("Nurse");
        _clinicContext.HasPermission(ClinicPermissions.AppointmentsManage).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
    }

    private (UpdateTeleconsultPaymentPolicyCommandHandler Handler, ApplicationDbContext Db, IInteropPublisher Publisher) CreateHandler(IClinicContext? context = null)
    {
        var ctx = context ?? _clinicContext;
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, ctx, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        return (handler, db, publisher);
    }

    private async Task<(Appointment Appointment, Patient Patient)> SeedAppointmentAsync(
        ApplicationDbContext db,
        AppointmentType appointmentType = AppointmentType.Teleconsult,
        TeleconsultPaymentPolicy policy = TeleconsultPaymentPolicy.Prepaid,
        TeleconsultPaymentStatus status = TeleconsultPaymentStatus.Pending,
        Guid? callId = null,
        Guid? invoiceId = null,
        decimal? paidAmount = null,
        bool isEmergencyOverride = false,
        string? emergencyReasonCode = null,
        Guid? clinicIdOverride = null,
        string? tenantIdOverride = null,
        bool isDeleted = false,
        string serviceType = "Teleconsult")
    {
        var targetClinicId = clinicIdOverride ?? _clinicId;
        var targetTenantId = tenantIdOverride ?? _tenantId;

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = targetTenantId,
            ClinicId = targetClinicId,
            PatientCode = $"PAT-{Guid.NewGuid():N}"[..12].ToUpperInvariant(),
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09171234567"
        };
        db.Patients.Add(patient);

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = targetTenantId,
            ClinicId = targetClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            ScheduledAt = DateTime.UtcNow.AddHours(2),
            DurationMinutes = 30,
            AppointmentType = appointmentType,
            ServiceType = serviceType,
            PaymentPolicy = policy,
            PaymentStatus = status,
            CallId = callId ?? (appointmentType == AppointmentType.Teleconsult ? Guid.NewGuid() : null),
            InvoiceId = invoiceId,
            InvoiceRequestId = invoiceId,
            PaidAmount = paidAmount,
            IsEmergencyOverride = isEmergencyOverride,
            EmergencyOverrideReasonCode = emergencyReasonCode,
            IsDeleted = isDeleted,
            CreatedAt = DateTime.UtcNow
        };
        db.Appointments.Add(appointment);

        var settings = new FacilitySettings
        {
            ClinicId = targetClinicId,
            TenantId = targetTenantId,
            ClinicName = "Main Health Clinic",
            TeleconsultPaymentPolicy = "Prepaid",
            TeleconsultDefaultFee = 450.00m
        };
        db.Settings.Add(settings);

        await db.SaveChangesAsync();
        return (appointment, patient);
    }

    [Fact]
    public async Task SwitchToExempt_SetsPolicyAndStatus_EmitsPaymentCleared_AndLogsWormAudit()
    {
        // Arrange
        var (handler, db, publisher) = CreateHandler();
        var callId = Guid.NewGuid();
        var (appointment, _) = await SeedAppointmentAsync(db, policy: TeleconsultPaymentPolicy.Prepaid, status: TeleconsultPaymentStatus.Pending, callId: callId);

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        result.CanAdmit.Should().BeTrue();

        var updatedAppointment = await db.Appointments.FindAsync(appointment.Id);
        updatedAppointment!.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        updatedAppointment.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);

        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallPaymentClearedPayload>(p =>
                p.CallId == callId &&
                p.PaymentMethod == "PolicyExempt" &&
                !p.IsEmergencyOverride));

        var audit = await db.AuditEntries.SingleAsync(a => a.Action == "teleconsult.payment_policy.updated" && a.TargetEntityId == appointment.Id.ToString());
        audit.Category.Should().Be(ClinicAuditCategories.Appointments);
        audit.Description.Should().Contain("updated from Prepaid to Exempt");
    }

    [Fact]
    public async Task SwitchToExempt_WhenCallIdIsNull_GeneratesCallId_AndEmitsPaymentCleared()
    {
        // Arrange
        var (handler, db, publisher) = CreateHandler();
        var (appointment, _) = await SeedAppointmentAsync(db, policy: TeleconsultPaymentPolicy.Prepaid, callId: null);
        appointment.CallId = null;
        await db.SaveChangesAsync();

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        result.CallId.Should().NotBeNull();
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);

        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            result.CallId!.Value,
            Arg.Any<CommsCallPaymentClearedPayload>());
    }

    [Fact]
    public async Task SwitchToPostpaid_WhenPending_SetsStatusPendingWithoutEmittingEvent()
    {
        // Arrange
        var (handler, db, publisher) = CreateHandler();
        var (appointment, _) = await SeedAppointmentAsync(db, policy: TeleconsultPaymentPolicy.Prepaid, status: TeleconsultPaymentStatus.Pending);

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Postpaid), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        result.CanAdmit.Should().BeTrue(); // Postpaid allows admission

        publisher.DidNotReceive().Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Any<Guid>(),
            Arg.Any<object>());
    }

    [Fact]
    public async Task SwitchToPostpaid_WhenAlreadyPaid_PreservesPaidStatus()
    {
        // Arrange
        var (handler, db, _) = CreateHandler();
        var (appointment, _) = await SeedAppointmentAsync(db, policy: TeleconsultPaymentPolicy.Prepaid, status: TeleconsultPaymentStatus.Paid, paidAmount: 400m);

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Postpaid), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);

        var updated = await db.Appointments.FindAsync(appointment.Id);
        updated!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        updated.PaidAmount.Should().Be(400m);
    }

    [Fact]
    public async Task SwitchToPrepaid_WhenInvoiceIdNull_GeneratesLinkedDraftInvoice()
    {
        // Arrange
        var (handler, db, _) = CreateHandler();
        var (appointment, _) = await SeedAppointmentAsync(db, policy: TeleconsultPaymentPolicy.Exempt, status: TeleconsultPaymentStatus.Exempt, invoiceId: null);

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Prepaid), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        result.CanAdmit.Should().BeFalse();

        var updated = await db.Appointments.FindAsync(appointment.Id);
        updated!.InvoiceId.Should().NotBeNull();

        var invoice = await db.Invoices.FindAsync(updated.InvoiceId!.Value);
        invoice.Should().NotBeNull();
        invoice!.AppointmentId.Should().Be(appointment.Id);
        invoice.GrossAmount.Should().Be(450.00m); // from seeded settings
        invoice.Status.Should().Be(InvoiceStatus.Draft);
    }

    [Fact]
    public async Task SwitchToPrepaid_WhenInvoiceAlreadyExists_DoesNotDuplicateInvoice()
    {
        // Arrange
        var (handler, db, _) = CreateHandler();
        var existingInvoiceId = Guid.NewGuid();
        var (appointment, patient) = await SeedAppointmentAsync(db, policy: TeleconsultPaymentPolicy.Exempt, invoiceId: existingInvoiceId);

        var existingInvoice = new Invoice
        {
            Id = existingInvoiceId,
            InvoiceNumber = "INV-20261113-EXIST1",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = appointment.Id,
            PatientId = patient.Id,
            PatientName = appointment.PatientName,
            GrossAmount = 400m,
            NetAmount = 400m,
            BalanceDue = 400m,
            Status = InvoiceStatus.Draft
        };
        db.Invoices.Add(existingInvoice);
        await db.SaveChangesAsync();

        var invoiceCountBefore = await db.Invoices.CountAsync();

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Prepaid), CancellationToken.None);

        // Assert
        var invoiceCountAfter = await db.Invoices.CountAsync();
        invoiceCountAfter.Should().Be(invoiceCountBefore);

        var updated = await db.Appointments.FindAsync(appointment.Id);
        updated!.InvoiceId.Should().Be(existingInvoiceId);
    }

    [Fact]
    public async Task SwitchToPrepaid_WhenAlreadyPaid_PreservesPaidStatus()
    {
        // Arrange
        var (handler, db, _) = CreateHandler();
        var (appointment, _) = await SeedAppointmentAsync(db, policy: TeleconsultPaymentPolicy.Postpaid, status: TeleconsultPaymentStatus.Paid, paidAmount: 450m);

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Prepaid), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        result.CanAdmit.Should().BeTrue();
    }

    [Fact]
    public async Task SwitchToPrepaid_WhenOverridden_PreservesOverriddenStatus()
    {
        // Arrange
        var (handler, db, _) = CreateHandler();
        var (appointment, _) = await SeedAppointmentAsync(
            db,
            policy: TeleconsultPaymentPolicy.Postpaid,
            status: TeleconsultPaymentStatus.Overridden,
            isEmergencyOverride: true,
            emergencyReasonCode: "STAFF-OVERRIDE");

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Prepaid), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        result.IsEmergencyOverride.Should().BeTrue();
        result.CanAdmit.Should().BeTrue();
    }

    [Fact]
    public async Task CallerLackingPermissions_ThrowsForbiddenException()
    {
        // Arrange
        var forbiddenContext = Substitute.For<IClinicContext>();
        forbiddenContext.ClinicId.Returns(_clinicId);
        forbiddenContext.TenantId.Returns(_tenantId);
        forbiddenContext.HasPermission(ClinicPermissions.AppointmentsManage).Returns(false);
        forbiddenContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);

        var (handler, db, _) = CreateHandler(forbiddenContext);
        var (appointment, _) = await SeedAppointmentAsync(db);

        // Act
        var act = () => handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*appointments:manage or consultations:write*");
    }

    [Fact]
    public async Task CallerWithAppointmentsManage_Succeeds()
    {
        // Arrange
        var frontDeskContext = Substitute.For<IClinicContext>();
        frontDeskContext.ClinicId.Returns(_clinicId);
        frontDeskContext.TenantId.Returns(_tenantId);
        frontDeskContext.StaffId.Returns(Guid.NewGuid());
        frontDeskContext.StaffName.Returns("Receptionist");
        frontDeskContext.HasPermission(ClinicPermissions.AppointmentsManage).Returns(true);
        frontDeskContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);

        var (handler, db, _) = CreateHandler(frontDeskContext);
        var (appointment, _) = await SeedAppointmentAsync(db);

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
    }

    [Fact]
    public async Task CallerWithConsultationsWrite_Succeeds()
    {
        // Arrange
        var clinicianContext = Substitute.For<IClinicContext>();
        clinicianContext.ClinicId.Returns(_clinicId);
        clinicianContext.TenantId.Returns(_tenantId);
        clinicianContext.StaffId.Returns(Guid.NewGuid());
        clinicianContext.StaffName.Returns("Dr. Clinician");
        clinicianContext.HasPermission(ClinicPermissions.AppointmentsManage).Returns(false);
        clinicianContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);

        var (handler, db, _) = CreateHandler(clinicianContext);
        var (appointment, _) = await SeedAppointmentAsync(db);

        // Act
        var result = await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
    }

    [Fact]
    public async Task AppointmentNotFound_ThrowsNotFoundException()
    {
        // Arrange
        var (handler, _, _) = CreateHandler();
        var nonExistentId = Guid.NewGuid();

        // Act
        var act = () => handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(nonExistentId, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*{nonExistentId}*");
    }

    [Fact]
    public async Task AppointmentSoftDeleted_ThrowsNotFoundException()
    {
        // Arrange
        var (handler, db, _) = CreateHandler();
        var (appointment, _) = await SeedAppointmentAsync(db, isDeleted: true);

        // Act
        var act = () => handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task NonTeleconsultAppointment_ThrowsBadRequestException()
    {
        // Arrange
        var (handler, db, _) = CreateHandler();
        var (appointment, _) = await SeedAppointmentAsync(
            db,
            appointmentType: AppointmentType.InPerson,
            serviceType: "General Consultation");

        // Act
        var act = () => handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not a teleconsultation*");
    }

    [Fact]
    public async Task CrossTenantAppointment_ThrowsNotFoundException()
    {
        // Arrange
        var (handler, db, _) = CreateHandler();
        var otherClinicId = Guid.NewGuid();
        var otherTenantId = "other-tenant";
        var (appointment, _) = await SeedAppointmentAsync(db, clinicIdOverride: otherClinicId, tenantIdOverride: otherTenantId);

        // Act
        var act = () => handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task WormAuditEntry_MutationOrDeletion_ThrowsInvalidOperationException()
    {
        // Arrange
        var (handler, db, _) = CreateHandler();
        var (appointment, _) = await SeedAppointmentAsync(db);

        // Execute command to generate WORM audit entry
        await handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointment.Id, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);

        var audit = await db.AuditEntries.SingleAsync(a => a.Action == "teleconsult.payment_policy.updated" && a.TargetEntityId == appointment.Id.ToString());

        // Act & Assert 1: Tampering / Mutation Attack
        audit.Description = "Tampered description trying to modify WORM log";
        var mutateAct = () => db.SaveChangesAsync();
        await mutateAct.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*AuditEntry is append-only (WORM)*");

        // Act & Assert 2: Deletion Attack
        db.Entry(audit).State = EntityState.Unchanged;
        db.AuditEntries.Remove(audit);
        var deleteAct = () => db.SaveChangesAsync();
        await deleteAct.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*AuditEntry is append-only (WORM)*");
    }
}
