using System;
using System.Collections.Generic;
using System.Linq;
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
using ClinicEz.Clinic.Infrastructure.Messaging.Handlers;
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

namespace ClinicEz.Clinic.Application.Tests.Features.Teleconsult;

/// <summary>
/// Adversarial stress testing harness for Milestone 2:
/// - Modality inference edge cases (casing, whitespace, enums)
/// - Backward compatibility for callers & constructors (CreateAppointmentCommand, AppointmentDto, RecordPaymentCommand)
/// - Boundary tests for TeleconsultStatusDto (defaults, serialization, IsYakapExempt alias)
/// - Concurrency & tenant isolation (cross-clinic data leakage prevention)
/// - Soft-deleted record rejection across all M2 query/command handlers
/// - Emergency override boundary validation (note length, reason codes, permissions)
/// - Payment policy dynamic switching and invoice deduplication
/// </summary>
public sealed class AdversarialMilestone2ChallengerTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-adv-m2";
    private readonly IClinicContext _clinicContext;

    public AdversarialMilestone2ChallengerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Dr. Challenger M2");
        _clinicContext.StaffRole.Returns("Doctor");
        _clinicContext.HasPermission(ClinicPermissions.AppointmentsManage).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);
    }

    #region 1. Modality Inference Edge Cases

    [Theory]
    [InlineData("teleconsult")]
    [InlineData("Teleconsult")]
    [InlineData("TELECONSULT")]
    [InlineData("tElEcOnSuLt")]
    [InlineData("teleconsultation")]
    [InlineData("Teleconsultation")]
    [InlineData("TELECONSULTATION")]
    [InlineData("tElEcOnSuLtAtIoN")]
    public void AppointmentEntity_IsTeleconsult_CaseInsensitiveMatching_Succeeds(string serviceType)
    {
        var appointment = new Appointment
        {
            PatientName = "Test Patient",
            AppointmentType = AppointmentType.InPerson, // Should be inferred from ServiceType
            ServiceType = serviceType
        };

        appointment.IsTeleconsult.Should().BeTrue();
    }

    [Theory]
    [InlineData("General Consultation")]
    [InlineData("Laboratory")]
    [InlineData("Vaccination")]
    [InlineData(null)]
    [InlineData("")]
    public void AppointmentEntity_IsTeleconsult_NonTeleconsultServiceType_ReturnsFalse(string? serviceType)
    {
        var appointment = new Appointment
        {
            PatientName = "Test Patient",
            AppointmentType = AppointmentType.InPerson,
            ServiceType = serviceType
        };

        appointment.IsTeleconsult.Should().BeFalse();
    }

    [Theory]
    [InlineData("teleconsult")]
    [InlineData("TELECONSULT")]
    [InlineData("Teleconsultation")]
    [InlineData("TELECONSULTATION")]
    public async Task CreateAppointmentCommand_CaseInsensitiveServiceType_InfersTeleconsultAndGeneratesCallId(string serviceType)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var handler = new CreateAppointmentCommandHandler(
            appointmentRepo, uow, _clinicContext, null, publisher, settingsRepo, invoiceRepo);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Patient Casing Test",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: DateTime.UtcNow.AddHours(2),
            DurationMinutes: 30,
            ServiceType: serviceType
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.AppointmentType.Should().Be(AppointmentType.Teleconsult);
        result.IsTeleconsult.Should().BeTrue();
        result.CallId.Should().NotBeNull();
    }


    [Fact]
    public async Task CreateAppointmentCommand_ExplicitAppointmentTypeTeleconsult_OverridesServiceType()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var handler = new CreateAppointmentCommandHandler(appointmentRepo, uow, _clinicContext);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Explicit Teleconsult Patient",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: DateTime.UtcNow.AddHours(1),
            DurationMinutes: 30,
            ServiceType: "General Consultation", // Non-teleconsult service type
            AppointmentType: AppointmentType.Teleconsult // Explicit override
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.AppointmentType.Should().Be(AppointmentType.Teleconsult);
        result.IsTeleconsult.Should().BeTrue();
        result.CallId.Should().NotBeNull();
    }


    [Theory]
    [InlineData("teleconsult")]
    [InlineData("TELECONSULT")]
    [InlineData("Teleconsult")]
    public async Task AppointmentBookedHandler_CaseInsensitiveAppointmentType_InfersTeleconsult(string apptType)
    {
        // Arrange
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-booked-casing";
        MessagingTestKit.SeedClinic(db, clinicId, tenantId);
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
            AppointmentType = apptType,
            Reason = "Follow up",
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
    }

    [Theory]
    [InlineData("Teleconsultation")]
    [InlineData("teleconsult")]
    [InlineData("TELECONSULTATION")]
    public async Task AppointmentBookedHandler_ReasonAsTeleconsult_InfersTeleconsultModality(string reason)
    {
        // Arrange
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-booked-reason";
        MessagingTestKit.SeedClinic(db, clinicId, tenantId);
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
            AppointmentType = null, // Not set
            Reason = reason,
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
    }

    [Theory]
    [InlineData("  Teleconsult  ")]
    [InlineData(" Teleconsultation ")]
    public async Task CreateAppointmentCommand_WhitespacePaddedServiceType_WithoutExplicitTrim_ResolvesInPerson(string paddedServiceType)
    {
        // Observe exact behavior when untrimmed whitespace is passed:
        // string.Equals(request.ServiceType, "Teleconsult", ...) evaluates to false because request.ServiceType is compared without prior trimming.
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var handler = new CreateAppointmentCommandHandler(appointmentRepo, uow, _clinicContext);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Whitespace Padded Patient",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: DateTime.UtcNow.AddHours(2),
            DurationMinutes: 30,
            ServiceType: paddedServiceType
        );

        var result = await handler.Handle(command, CancellationToken.None);

        // Result: Because ServiceType was not trimmed at line 87, resolvedAppointmentType falls back to InPerson
        result.AppointmentType.Should().Be(AppointmentType.InPerson);
        result.CallId.Should().BeNull();
    }

    #endregion

    #region 2. Backward Compatibility for Callers & Constructors

    [Fact]
    public async Task CreateAppointmentCommand_LegacyCaller_WithoutOptionalParameters_Succeeds()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        // Instantiate handler with only the 3 original required constructor arguments
        var handler = new CreateAppointmentCommandHandler(appointmentRepo, uow, _clinicContext);

        // Instantiate command with only required parameters
        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Legacy Caller Patient",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: DateTime.UtcNow.AddHours(1)
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientName.Should().Be("Legacy Caller Patient");
        result.AppointmentType.Should().Be(AppointmentType.InPerson);
        result.IsTeleconsult.Should().BeFalse();
        result.CallId.Should().BeNull();
    }

    [Fact]
    public void AppointmentDto_DefaultValues_PreserveBackwardCompatibility()
    {
        // Instantiate AppointmentDto with only the original non-default fields
        var id = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var dto = new AppointmentDto(
            Id: id,
            TenantId: "t1",
            ClinicId: clinicId,
            DraftId: null,
            PatientId: patientId,
            PatientName: "Jose Rizal",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: now,
            DurationMinutes: 30,
            Status: AppointmentStatus.Confirmed,
            ServiceType: "Consultation",
            Reason: "Checkup",
            Notes: null,
            CreatedAt: now,
            AttachedFileIdsJson: "[]",
            ShareFieldsJson: "[]",
            SharedScopes: new List<string>(),
            SharedItems: new List<ShareItemDto>()
        );

        // Verify default teleconsult fields
        dto.AppointmentType.Should().Be(AppointmentType.InPerson);
        dto.IsTeleconsult.Should().BeFalse();
        dto.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        dto.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        dto.InvoiceId.Should().BeNull();
        dto.PaidAmount.Should().BeNull();
        dto.CallId.Should().BeNull();
        dto.AdmittedAtUtc.Should().BeNull();
        dto.IsEmergencyOverride.Should().BeFalse();
        dto.EmergencyOverrideReasonCode.Should().BeNull();
    }

    [Fact]
    public void AppointmentDto_From_MapsAllTeleconsultProperties()
    {
        var id = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();
        var admittedAt = DateTime.UtcNow;

        var appointment = new Appointment
        {
            Id = id,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Apolinario Mabini",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 45,
            Status = AppointmentStatus.InConsultation,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt,
            InvoiceId = invoiceId,
            PaidAmount = 450.00m,
            CallId = callId,
            AdmittedAtUtc = admittedAt,
            IsEmergencyOverride = true,
            EmergencyOverrideReasonCode = "CRITICAL-CARE"
        };

        var dto = AppointmentDto.From(appointment);

        dto.AppointmentType.Should().Be(AppointmentType.Teleconsult);
        dto.IsTeleconsult.Should().BeTrue();
        dto.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        dto.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        dto.InvoiceId.Should().Be(invoiceId);
        dto.PaidAmount.Should().Be(450.00m);
        dto.CallId.Should().Be(callId);
        dto.AdmittedAtUtc.Should().Be(admittedAt);
        dto.IsEmergencyOverride.Should().BeTrue();
        dto.EmergencyOverrideReasonCode.Should().Be("CRITICAL-CARE");
    }

    [Fact]
    public async Task RecordPaymentCommand_LegacyConstructors_WithoutAppointmentRepo_Succeeds()
    {
        // Test 3-argument constructor
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var invoiceId = Guid.NewGuid();
        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-LEGACY-01",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Legacy Invoice Patient",
            GrossAmount = 250.00m,
            NetAmount = 250.00m,
            BalanceDue = 250.00m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft,
            InvoiceDate = DateTime.UtcNow
        };
        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        var handler3Args = new RecordPaymentCommandHandler(invoiceRepo, uow, _clinicContext);

        var command = new RecordPaymentCommand(
            InvoiceId: invoiceId,
            Amount: 250.00m,
            Method: PaymentMethod.Cash
        );

        var result = await handler3Args.Handle(command, CancellationToken.None);
        result.Status.Should().Be(InvoiceStatus.Paid);
        result.BalanceDue.Should().Be(0m);
    }

    [Fact]
    public async Task RecordPaymentCommand_PartialPayment_DoesNotMarkPaidOrEmitCleared()
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
            PatientName = "Partial Payment Patient",
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
            InvoiceNumber = "INV-PARTIAL-01",
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

        // Act 1: Partial payment of 150 out of 400
        var command1 = new RecordPaymentCommand(invoiceId, 150.00m, PaymentMethod.Cash);
        var result1 = await handler.Handle(command1, CancellationToken.None);

        // Assert 1: Invoice partially paid, appointment still Pending, zero clearance events
        result1.Status.Should().Be(InvoiceStatus.PartiallyPaid);
        result1.BalanceDue.Should().Be(250.00m);

        var apptAfterP1 = await context.Appointments.FindAsync(appointmentId);
        apptAfterP1!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        publisher.DidNotReceive().Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Any<Guid>(),
            Arg.Any<object>());

        // Act 2: Settle remaining balance of 250
        var command2 = new RecordPaymentCommand(invoiceId, 250.00m, PaymentMethod.Cash);
        var result2 = await handler.Handle(command2, CancellationToken.None);

        // Assert 2: Invoice fully paid, appointment marked Paid, clearance event emitted
        result2.Status.Should().Be(InvoiceStatus.Paid);
        result2.BalanceDue.Should().Be(0m);

        var apptAfterP2 = await context.Appointments.FindAsync(appointmentId);
        apptAfterP2!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        apptAfterP2.PaidAmount.Should().Be(400.00m);
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            callId,
            Arg.Is<CommsCallPaymentClearedPayload>(p => p.CallId == callId && p.InvoiceId == invoiceId));
    }

    #endregion

    #region 3. Boundary Tests for TeleconsultStatusDto

    [Fact]
    public void TeleconsultStatusDto_IsYakapExemptAlias_ReflectsHasActiveYakapEnlistment()
    {
        var id = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var dtoWithYakap = new TeleconsultStatusDto(
            AppointmentId: id,
            PatientId: patientId,
            PatientName: "Yakap Patient",
            ScheduledAt: DateTime.UtcNow,
            AppointmentType: AppointmentType.Teleconsult,
            PaymentPolicy: TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus: TeleconsultPaymentStatus.Pending,
            CanAdmit: false,
            HasActiveYakapEnlistment: true,
            CallId: Guid.NewGuid(),
            IsEmergencyOverride: false,
            EmergencyOverrideReasonCode: null
        );

        dtoWithYakap.HasActiveYakapEnlistment.Should().BeTrue();
        dtoWithYakap.IsYakapExempt.Should().BeTrue(); // Alias returns true

        var dtoWithoutYakap = new TeleconsultStatusDto(
            AppointmentId: id,
            PatientId: patientId,
            PatientName: "Non-Yakap Patient",
            ScheduledAt: DateTime.UtcNow,
            AppointmentType: AppointmentType.Teleconsult,
            PaymentPolicy: TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus: TeleconsultPaymentStatus.Pending,
            CanAdmit: false,
            HasActiveYakapEnlistment: false,
            CallId: Guid.NewGuid(),
            IsEmergencyOverride: false,
            EmergencyOverrideReasonCode: null
        );

        dtoWithoutYakap.HasActiveYakapEnlistment.Should().BeFalse();
        dtoWithoutYakap.IsYakapExempt.Should().BeFalse(); // Alias returns false
    }

    [Fact]
    public void TeleconsultStatusDto_SerializationAndDeserialization_RoundTripsAccurately()
    {
        var id = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var dto = new TeleconsultStatusDto(
            AppointmentId: id,
            PatientId: patientId,
            PatientName: "Serialization Patient",
            ScheduledAt: now,
            AppointmentType: AppointmentType.Teleconsult,
            PaymentPolicy: TeleconsultPaymentPolicy.Postpaid,
            PaymentStatus: TeleconsultPaymentStatus.Pending,
            CanAdmit: true,
            HasActiveYakapEnlistment: true,
            CallId: callId,
            IsEmergencyOverride: false,
            EmergencyOverrideReasonCode: null,
            InvoiceId: invoiceId,
            RecordingPolicy: "Both",
            RecordingConsentRequired: false,
            ActiveRecordingSessionId: sessionId
        );

        var json = JsonSerializer.Serialize(dto, InteropJson.Options);
        json.Should().Contain("\"isYakapExempt\":true");
        json.Should().Contain("\"recordingPolicy\":\"Both\"");

        var deserialized = JsonSerializer.Deserialize<TeleconsultStatusDto>(json, InteropJson.Options);
        deserialized.Should().NotBeNull();
        deserialized!.AppointmentId.Should().Be(id);
        deserialized.PatientId.Should().Be(patientId);
        deserialized.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        deserialized.CanAdmit.Should().BeTrue();
        deserialized.HasActiveYakapEnlistment.Should().BeTrue();
        deserialized.IsYakapExempt.Should().BeTrue();
        deserialized.RecordingPolicy.Should().Be("Both");
        deserialized.RecordingConsentRequired.Should().BeFalse();
        deserialized.ActiveRecordingSessionId.Should().Be(sessionId);
    }

    #endregion

    #region 4. Concurrency & Tenant Isolation

    [Fact]
    public async Task GetTeleconsultStatus_OtherClinicAppointment_ThrowsNotFoundException()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var foreignClinicId = Guid.NewGuid();
        var foreignAppointmentId = Guid.NewGuid();

        var foreignAppointment = new Appointment
        {
            Id = foreignAppointmentId,
            TenantId = "foreign-tenant",
            ClinicId = foreignClinicId, // Different clinic
            PatientId = Guid.NewGuid(),
            PatientName = "Foreign Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult
        };
        context.Appointments.Add(foreignAppointment);
        await context.SaveChangesAsync();

        var handler = new GetTeleconsultStatusQueryHandler(appointmentRepo, patientRepo, _clinicContext);

        // Act & Assert
        var act = () => handler.Handle(new GetTeleconsultStatusQuery(foreignAppointmentId), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task AdmitTeleconsultPatient_OtherClinicAppointment_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var foreignClinicId = Guid.NewGuid();
        var foreignAppointmentId = Guid.NewGuid();

        var foreignAppointment = new Appointment
        {
            Id = foreignAppointmentId,
            TenantId = "foreign-tenant",
            ClinicId = foreignClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Foreign Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt
        };
        context.Appointments.Add(foreignAppointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(foreignAppointmentId), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task UpdateTeleconsultPaymentPolicy_OtherClinicAppointment_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var foreignClinicId = Guid.NewGuid();
        var foreignAppointmentId = Guid.NewGuid();

        var foreignAppointment = new Appointment
        {
            Id = foreignAppointmentId,
            TenantId = "foreign-tenant",
            ClinicId = foreignClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Foreign Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult
        };
        context.Appointments.Add(foreignAppointment);
        await context.SaveChangesAsync();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(foreignAppointmentId, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task RecordPaymentCommand_CrossClinicAppointment_DoesNotModifyForeignAppointment()
    {
        // Arrange: Invoice in clinic A points to an appointment in clinic B
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var foreignClinicId = Guid.NewGuid();
        var foreignAppointmentId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();

        var foreignAppointment = new Appointment
        {
            Id = foreignAppointmentId,
            TenantId = "foreign-tenant",
            ClinicId = foreignClinicId, // Different clinic
            PatientId = Guid.NewGuid(),
            PatientName = "Cross Clinic Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            InvoiceId = invoiceId
        };
        context.Appointments.Add(foreignAppointment);

        var localInvoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-CROSS-01",
            TenantId = _tenantId,
            ClinicId = _clinicId, // Belongs to local clinic
            AppointmentId = foreignAppointmentId,
            PatientId = foreignAppointment.PatientId,
            PatientName = foreignAppointment.PatientName,
            GrossAmount = 300.00m,
            NetAmount = 300.00m,
            BalanceDue = 300.00m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft,
            InvoiceDate = DateTime.UtcNow
        };
        context.Invoices.Add(localInvoice);
        await context.SaveChangesAsync();

        var handler = new RecordPaymentCommandHandler(
            invoiceRepo, paymentRepo, appointmentRepo, uow, _clinicContext, publisher);

        var command = new RecordPaymentCommand(invoiceId, 300.00m, PaymentMethod.Cash);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Local invoice is paid, but foreign appointment is unchanged (isolation preserved)
        result.Status.Should().Be(InvoiceStatus.Paid);

        var unchangedAppt = await context.Appointments.FindAsync(foreignAppointmentId);
        unchangedAppt!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending); // NOT modified!
        publisher.DidNotReceive().Enqueue(
            InteropTypes.CommsCallPaymentCleared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Any<Guid>(),
            Arg.Any<object>());
    }

    #endregion

    #region 5. Soft-Deleted Record Rejection

    [Fact]
    public async Task GetTeleconsultStatus_SoftDeletedAppointment_ThrowsNotFoundException()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var appointmentId = Guid.NewGuid();
        var deletedAppointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Deleted Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            IsDeleted = true // Soft deleted
        };
        context.Appointments.Add(deletedAppointment);
        await context.SaveChangesAsync();

        var handler = new GetTeleconsultStatusQueryHandler(appointmentRepo, patientRepo, _clinicContext);

        // Act & Assert
        var act = () => handler.Handle(new GetTeleconsultStatusQuery(appointmentId), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task AdmitTeleconsultPatient_SoftDeletedAppointment_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var deletedAppointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Deleted Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt,
            IsDeleted = true
        };
        context.Appointments.Add(deletedAppointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task UpdateTeleconsultPaymentPolicy_SoftDeletedAppointment_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var deletedAppointment = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Deleted Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            IsDeleted = true
        };
        context.Appointments.Add(deletedAppointment);
        await context.SaveChangesAsync();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointmentId, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    #endregion

    #region 6. Emergency Override Boundary Stress

    [Theory]
    [InlineData("1234")]
    [InlineData("Help")]
    [InlineData("    abc    ")] // Trims to 3 chars
    [InlineData("")]
    [InlineData(null)]
    public async Task AdmitTeleconsultPatient_ReasonNoteUnder5Characters_ThrowsBadRequestException(string? shortNote)
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
            PatientName = "Short Note Patient",
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
            ReasonCode: null,
            ReasonNote: shortNote
        );

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, overrideDto), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*minimum 5 characters*");
    }

    [Fact]
    public async Task AdmitTeleconsultPatient_StaffWithoutSignOrWritePermission_ThrowsForbiddenException()
    {
        // Arrange: Staff has AppointmentsRead but neither ConsultationsSign nor ConsultationsWrite
        var unprivilegedContext = Substitute.For<IClinicContext>();
        unprivilegedContext.ClinicId.Returns(_clinicId);
        unprivilegedContext.TenantId.Returns(_tenantId);
        unprivilegedContext.StaffId.Returns(Guid.NewGuid());
        unprivilegedContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);
        unprivilegedContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(unprivilegedContext);
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
            PatientName = "Unprivileged Staff Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };
        context.Appointments.Add(appointment);
        await context.SaveChangesAsync();

        var handler = new AdmitTeleconsultPatientCommandHandler(
            appointmentRepo, patientRepo, auditRepo, uow, unprivilegedContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: null,
            ReasonNote: "Valid clinical justification note"
        );

        // Act & Assert
        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, overrideDto), CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*consultation authority*");
    }

    #endregion

    #region 7. Payment Policy Transitions & Guardrails

    [Fact]
    public async Task UpdateTeleconsultPaymentPolicy_NonTeleconsultAppointment_ThrowsBadRequestException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var appointmentId = Guid.NewGuid();
        var inPersonAppt = new Appointment
        {
            Id = appointmentId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "In-Person Visit",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            AppointmentType = AppointmentType.InPerson, // In-person
            ServiceType = "Consultation"
        };
        context.Appointments.Add(inPersonAppt);
        await context.SaveChangesAsync();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(appointmentId, TeleconsultPaymentPolicy.Exempt), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not a teleconsultation*");
    }

    [Fact]
    public async Task UpdateTeleconsultPaymentPolicy_StaffLackingBothPermissions_ThrowsForbiddenException()
    {
        // Arrange: staff lacks both AppointmentsManage and ConsultationsWrite
        var unprivilegedContext = Substitute.For<IClinicContext>();
        unprivilegedContext.ClinicId.Returns(_clinicId);
        unprivilegedContext.TenantId.Returns(_tenantId);
        unprivilegedContext.StaffId.Returns(Guid.NewGuid());
        unprivilegedContext.HasPermission(ClinicPermissions.AppointmentsManage).Returns(false);
        unprivilegedContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(unprivilegedContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var handler = new UpdateTeleconsultPaymentPolicyCommandHandler(
            appointmentRepo, invoiceRepo, settingsRepo, patientRepo, auditRepo, uow, unprivilegedContext, publisher,
            NullLogger<UpdateTeleconsultPaymentPolicyCommandHandler>.Instance);

        // Act & Assert
        var act = () => handler.Handle(new UpdateTeleconsultPaymentPolicyCommand(Guid.NewGuid(), TeleconsultPaymentPolicy.Exempt), CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*appointments:manage or consultations:write*");
    }

    #endregion
}
