using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone 3 (M3).
/// Stress-tests:
/// 1. All 6 alert kinds (Booked, Rescheduled, Cancelled, Reminder24h, Reminder2h, ManualReminder) with payload validation.
/// 2. Outbox message enqueuing with exact InteropTypes.PatientAppointmentAlert and addressing.
/// 3. Staff notification generation: action route "Appointments" and valid ActionParamsJson schema { appointmentId, date }.
/// 4. Edge cases: unlinked patients, cross-tenant isolation, null/whitespace doctor attribution, settings fallbacks.
/// 5. Transactional outbox discipline and reminder flag resets on reschedule.
/// </summary>
public class ChallengerM3EmpiricalTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-emp-m3-adversarial";
    private readonly IClinicContext _clinicContext;

    public ChallengerM3EmpiricalTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Theory]
    [InlineData(AppointmentAlertKinds.Booked)]
    [InlineData(AppointmentAlertKinds.Rescheduled)]
    [InlineData(AppointmentAlertKinds.Cancelled)]
    [InlineData(AppointmentAlertKinds.Reminder24h)]
    [InlineData(AppointmentAlertKinds.Reminder2h)]
    [InlineData(AppointmentAlertKinds.ManualReminder)]
    public async Task AllSixAlertKinds_GenerateCorrectPayload_And_InteropOutboxMessage(string alertKind)
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var syncPatientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Andres",
            LastName = "Bonifacio",
            PatientCode = "PAT-ADVERSARIAL-01",
            DateOfBirth = new DateOnly(1980, 11, 30),
            ContactNumber = "0918-123-4567",
            CloudPatientId = syncPatientId
        };
        await patientRepo.AddAsync(patient);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Katipunan Health Hub",
            EnableAppointmentReminders = true,
            EnableStaffAppointmentNotifications = true
        };
        await settingsRepo.AddAsync(settings);
        await context.SaveChangesAsync();

        var appointmentId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var scheduledAt = DateTime.UtcNow.AddDays(2);
        var appointment = new Appointment
        {
            Id = appointmentId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "Andres Bonifacio",
            DoctorId = doctorId,
            DoctorName = "Emilio Jacinto",
            ServiceType = "Comprehensive Consultation",
            ScheduledAt = scheduledAt,
            DurationMinutes = 45,
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchAlertAsync(appointment, alertKind, CancellationToken.None);

        // Assert: Interop outbox call
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Is<Party>(from =>
                from.Kind == PartyKind.Facility &&
                from.FacilityType == FacilityType.Clinic &&
                from.FacilityId == _clinicId.ToString() &&
                from.TenantId == _tenantId),
            Arg.Is<Party>(to =>
                to.Kind == PartyKind.Patient &&
                to.PatientId == syncPatientId.ToString()),
            appointmentId,
            Arg.Is<PatientAppointmentAlertPayload>(payload =>
                payload.AppointmentId == appointmentId &&
                payload.ClinicId == _clinicId &&
                payload.ClinicName == "Katipunan Health Hub" &&
                payload.DoctorId == doctorId &&
                payload.DoctorName == "Emilio Jacinto" &&
                payload.ServiceType == "Comprehensive Consultation" &&
                payload.DurationMinutes == 45 &&
                payload.AlertKind == alertKind &&
                !string.IsNullOrWhiteSpace(payload.Message) &&
                payload.Message.Contains("Katipunan Health Hub") &&
                payload.Message.Contains("Dr. Emilio Jacinto") &&
                payload.ScheduledAtUtc.Kind == DateTimeKind.Utc &&
                (DateTime.UtcNow - payload.TimestampUtc).TotalSeconds < 5));
    }

    [Theory]
    [InlineData("Dr. Jose Rizal", "with Dr. Jose Rizal")]
    [InlineData("dr. jose rizal", "with dr. jose rizal")]
    [InlineData("Dr.   Rizal", "with Dr.   Rizal")]
    [InlineData("DR. Antonio Luna", "with DR. Antonio Luna")]
    [InlineData("Antonio Luna", "with Dr. Antonio Luna")]
    [InlineData("   Apolinario Mabini   ", "with Dr. Apolinario Mabini")]
    public async Task MessageFormatting_DoctorAttribution_HandlesDrPrefixGracefullyWithoutDuplication(
        string inputDoctorName, string expectedSubstring)
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var syncPatientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Test",
            LastName = "Patient",
            PatientCode = "PAT-02",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "0917-111-2222",
            CloudPatientId = syncPatientId
        };
        await patientRepo.AddAsync(patient);
        await context.SaveChangesAsync();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "Test Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = inputDoctorName,
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Booked, CancellationToken.None);

        // Assert
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            appointment.Id,
            Arg.Is<PatientAppointmentAlertPayload>(p =>
                p.Message.Contains(expectedSubstring) &&
                !p.Message.Contains("Dr. Dr.")));
    }

    [Fact]
    public async Task MessageFormatting_NullOrEmptyDoctorAndService_DoesNotProduceMalformedText()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var syncPatientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Anonymous",
            LastName = "Patient",
            PatientCode = "PAT-03",
            DateOfBirth = new DateOnly(1995, 2, 2),
            ContactNumber = "0917-333-4444",
            CloudPatientId = syncPatientId
        };
        await patientRepo.AddAsync(patient);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Metro Health"
        };
        await settingsRepo.AddAsync(settings);
        await context.SaveChangesAsync();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "Anonymous Patient",
            DoctorId = null,
            DoctorName = "   ", // whitespace only
            ServiceType = "   ", // whitespace only
            ScheduledAt = new DateTime(2026, 12, 25, 9, 0, 0, DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Booked, CancellationToken.None);

        // Assert: Message shouldn't have "with Dr." or "for " dangling
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            appointment.Id,
            Arg.Is<PatientAppointmentAlertPayload>(p =>
                !p.Message.Contains("with") &&
                p.Message == "Your appointment at Metro Health has been booked for Dec 25, 2026 at 9:00 AM."));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task PatientAddressing_UnlinkedOrEmptyGuid_SkipsOutboxEnqueuingWithoutException(string? syncPatientGuidString)
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        Guid? parsedSync = syncPatientGuidString != null ? Guid.Parse(syncPatientGuidString) : null;

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "WalkIn",
            LastName = "User",
            PatientCode = "PAT-WALKIN",
            DateOfBirth = new DateOnly(1988, 8, 8),
            ContactNumber = "0917-555-5555",
            CloudPatientId = parsedSync
        };
        await patientRepo.AddAsync(patient);
        await context.SaveChangesAsync();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "WalkIn User",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        var act = async () => await dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Booked, CancellationToken.None);

        // Assert: Must not throw, must not enqueue
        await act.Should().NotThrowAsync();
        publisher.DidNotReceiveWithAnyArgs().Enqueue(
            Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(), Arg.Any<Guid>(), Arg.Any<PatientAppointmentAlertPayload>());
    }

    [Fact]
    public async Task MultiTenant_Isolation_IgnoresPatientFromDifferentClinic()
    {
        // Arrange: Patient exists under Clinic B with a valid SyncPatientId, but appointment is for Clinic A
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var differentClinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var crossTenantPatient = new Patient
        {
            Id = patientId,
            ClinicId = differentClinicId, // Clinic B!
            TenantId = "different-tenant",
            FirstName = "CrossTenant",
            LastName = "Patient",
            PatientCode = "PAT-CROSS",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "0917-666-6666",
            CloudPatientId = Guid.NewGuid()
        };
        await patientRepo.AddAsync(crossTenantPatient);
        await context.SaveChangesAsync();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId, // Clinic A!
            TenantId = _tenantId,
            PatientId = patientId,
            PatientName = "CrossTenant Patient",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act: Dispatcher queries patient with p.Id == PatientId && p.ClinicId == appointment.ClinicId
        await dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Booked, CancellationToken.None);

        // Assert: Should NOT find the cross-tenant patient, so skips outbox enqueue
        publisher.DidNotReceiveWithAnyArgs().Enqueue(
            Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(), Arg.Any<Guid>(), Arg.Any<PatientAppointmentAlertPayload>());
    }

    [Fact]
    public async Task StaffNotification_ActionRoute_And_ActionParamsJson_AreValidAndExact()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Test Clinic",
            EnableStaffAppointmentNotifications = true
        };
        await settingsRepo.AddAsync(settings);
        await context.SaveChangesAsync();

        var doctorId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var scheduledAt = new DateTime(2026, 11, 28, 15, 30, 0, DateTimeKind.Utc);

        var appointment = new Appointment
        {
            Id = appointmentId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            DoctorId = doctorId,
            DoctorName = "Dr. Jose",
            ScheduledAt = scheduledAt,
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchStaffNotificationAsync(appointment, "booked", CancellationToken.None);
        await context.SaveChangesAsync();

        // Assert
        var notification = await staffNotificationRepo.FindAsync(n => n.RecipientStaffId == doctorId);
        notification.Should().NotBeNull();
        notification!.ActionRoute.Should().Be("Appointments");
        notification.Category.Should().Be(StaffNotificationCategory.Appointment);
        notification.RecipientStaffId.Should().Be(doctorId);
        notification.RecipientRole.Should().Be("Doctor");
        notification.SourceType.Should().Be("Appointment");
        notification.SourceId.Should().Be(appointmentId.ToString());

        // Validate ActionParamsJson schema strictly
        notification.ActionParamsJson.Should().NotBeNullOrWhiteSpace();
        using var jsonDoc = JsonDocument.Parse(notification.ActionParamsJson);
        var root = jsonDoc.RootElement;
        root.GetProperty("appointmentId").GetString().Should().Be(appointmentId.ToString());
        root.GetProperty("date").GetString().Should().Be("2026-11-28");
    }

    [Theory]
    [InlineData("booked", "New Appointment: Melchora Aquino")]
    [InlineData("BOOKED", "New Appointment: Melchora Aquino")]
    [InlineData(AppointmentAlertKinds.Booked, "New Appointment: Melchora Aquino")]
    [InlineData("rescheduled", "Appointment Rescheduled: Melchora Aquino")]
    [InlineData("RESCHEDULED", "Appointment Rescheduled: Melchora Aquino")]
    [InlineData(AppointmentAlertKinds.Rescheduled, "Appointment Rescheduled: Melchora Aquino")]
    [InlineData("cancelled", "Appointment Cancelled: Melchora Aquino")]
    [InlineData("CANCELLED", "Appointment Cancelled: Melchora Aquino")]
    [InlineData(AppointmentAlertKinds.Cancelled, "Appointment Cancelled: Melchora Aquino")]
    [InlineData("custom_event", "Appointment Update: Melchora Aquino")]
    public async Task StaffNotification_TitleAndBody_HandlesAllEventTypesAndCaseVariations(string eventType, string expectedTitle)
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var doctorId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            DoctorId = doctorId,
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchStaffNotificationAsync(appointment, eventType, CancellationToken.None);
        await context.SaveChangesAsync();

        // Assert
        var notification = await staffNotificationRepo.FindAsync(n => n.RecipientStaffId == doctorId && n.SourceId == appointment.Id.ToString());
        notification.Should().NotBeNull();
        notification!.Title.Should().Be(expectedTitle);
        notification.Body.Should().Contain("Melchora Aquino");
    }

    [Fact]
    public async Task StaffNotification_DoctorMissingOrEmptyGuid_SkipsNotificationCleanly()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "No Doctor Appointment",
            DoctorId = Guid.Empty, // Empty guid doctor
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchStaffNotificationAsync(appointment, "booked", CancellationToken.None);
        await context.SaveChangesAsync();

        // Assert
        var count = await staffNotificationRepo.Query().CountAsync();
        count.Should().Be(0);
    }

    [Fact]
    public async Task StaffNotification_DisabledInSettings_SuppressesNotification()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Test Clinic",
            EnableStaffAppointmentNotifications = false // Disabled
        };
        await settingsRepo.AddAsync(settings);
        await context.SaveChangesAsync();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Disabled",
            DoctorId = Guid.NewGuid(),
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchStaffNotificationAsync(appointment, "booked", CancellationToken.None);
        await context.SaveChangesAsync();

        // Assert
        var count = await staffNotificationRepo.Query().CountAsync();
        count.Should().Be(0);
    }

    [Fact]
    public async Task RescheduleCommand_ResetsAllReminderFlagsAndTimestamps_AndDispatchesAlert()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var appointmentId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var initialTime = DateTime.UtcNow.AddDays(1);

        var appointment = new Appointment
        {
            Id = appointmentId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorId = doctorId,
            ScheduledAt = initialTime,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = true,
            Reminder2hSent = true,
            Reminder24hSentAt = DateTime.UtcNow.AddHours(-24),
            Reminder2hSentAt = DateTime.UtcNow.AddHours(-2),
            LastReminderSentAt = DateTime.UtcNow.AddHours(-2),
            LastReminderType = "2h"
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, uow, dispatcher);

        var newTime = DateTime.UtcNow.AddDays(4);
        var command = new RescheduleAppointmentCommand(appointmentId, newTime, 45, "Postponed");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ScheduledAt.Should().Be(newTime.ToUniversalTime());
        result.DurationMinutes.Should().Be(45);

        var reloaded = await repo.GetByIdAsync(appointmentId);
        reloaded.Should().NotBeNull();
        reloaded!.Reminder24hSent.Should().BeFalse("24h reminder flag must be reset upon reschedule");
        reloaded.Reminder2hSent.Should().BeFalse("2h reminder flag must be reset upon reschedule");
        reloaded.Reminder24hSentAt.Should().BeNull("24h reminder timestamp must be cleared upon reschedule");
        reloaded.Reminder2hSentAt.Should().BeNull("2h reminder timestamp must be cleared upon reschedule");

        // Verify dispatcher was invoked
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointmentId),
            AppointmentAlertKinds.Rescheduled,
            Arg.Any<CancellationToken>());

        await dispatcher.Received(1).DispatchStaffNotificationAsync(
            Arg.Is<Appointment>(a => a.Id == appointmentId),
            "rescheduled",
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CancelCommand_SetsStatusCancelled_AndDispatchesAlert()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var appointmentId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = appointmentId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Marcelo H. Del Pilar",
            DoctorId = Guid.NewGuid(),
            ScheduledAt = DateTime.UtcNow.AddDays(3),
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new CancelAppointmentCommandHandler(repo, uow, dispatcher);
        var command = new CancelAppointmentCommand(appointmentId, "Unable to attend");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Status.Should().Be(AppointmentStatus.Cancelled);

        var reloaded = await repo.GetByIdAsync(appointmentId);
        reloaded!.Status.Should().Be(AppointmentStatus.Cancelled);
        reloaded.Notes.Should().Contain("Cancelled: Unable to attend");

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointmentId && a.Status == AppointmentStatus.Cancelled),
            AppointmentAlertKinds.Cancelled,
            Arg.Any<CancellationToken>());

        await dispatcher.Received(1).DispatchStaffNotificationAsync(
            Arg.Is<Appointment>(a => a.Id == appointmentId && a.Status == AppointmentStatus.Cancelled),
            "cancelled",
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Dispatcher_ThrowsArgumentNullException_WhenAppointmentIsNull()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act & Assert
        var actAlert = async () => await dispatcher.DispatchAlertAsync(null!, AppointmentAlertKinds.Booked);
        await actAlert.Should().ThrowAsync<ArgumentNullException>();

        var actStaff = async () => await dispatcher.DispatchStaffNotificationAsync(null!, "booked");
        await actStaff.Should().ThrowAsync<ArgumentNullException>();
    }

    [Theory]
    [InlineData(0, 30)]
    [InlineData(-10, 30)]
    [InlineData(60, 60)]
    public async Task Dispatcher_NormalizesDuration_InAlertPayload(int inputDuration, int expectedDuration)
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var syncPatientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Duration",
            LastName = "Test",
            PatientCode = "PAT-DUR",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "0917-777-7777",
            CloudPatientId = syncPatientId
        };
        await patientRepo.AddAsync(patient);
        await context.SaveChangesAsync();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "Duration Test",
            DurationMinutes = inputDuration,
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Booked, CancellationToken.None);

        // Assert
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            appointment.Id,
            Arg.Is<PatientAppointmentAlertPayload>(p => p.DurationMinutes == expectedDuration));
    }
}
