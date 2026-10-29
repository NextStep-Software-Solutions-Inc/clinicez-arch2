using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

public sealed class AppointmentNotificationDispatcherTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "test-tenant-123";
    private readonly IClinicContext _clinicContext;

    public AppointmentNotificationDispatcherTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task DispatchAlertAsync_WhenPatientHasSyncPatientId_EnqueuesPatientAppointmentAlertPayload()
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
            FirstName = "Maria",
            LastName = "Santos",
            PatientCode = "P-100",
            DateOfBirth = new DateOnly(1992, 5, 10),
            ContactNumber = "0917-111-2222",
            CloudPatientId = syncPatientId
        };
        await patientRepo.AddAsync(patient);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "St. Jude Medical Clinic",
            EnableAppointmentReminders = true,
            EnableStaffAppointmentNotifications = true
        };
        await settingsRepo.AddAsync(settings);
        await context.SaveChangesAsync();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "Maria Santos",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            ServiceType = "General Consultation",
            ScheduledAt = new DateTime(2026, 11, 15, 14, 30, 0, DateTimeKind.Utc),
            DurationMinutes = 45,
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Booked, CancellationToken.None);

        // Assert
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Is<Party>(p => p.Kind == PartyKind.Facility && p.FacilityType == FacilityType.Clinic && p.FacilityId == _clinicId.ToString()),
            Arg.Is<Party>(p => p.Kind == PartyKind.Patient && p.PatientId == syncPatientId.ToString()),
            appointment.Id,
            Arg.Is<PatientAppointmentAlertPayload>(payload =>
                payload.AppointmentId == appointment.Id &&
                payload.ClinicId == _clinicId &&
                payload.ClinicName == "St. Jude Medical Clinic" &&
                payload.DoctorId == appointment.DoctorId &&
                payload.DoctorName == "Dr. Jose Rizal" &&
                payload.ServiceType == "General Consultation" &&
                payload.DurationMinutes == 45 &&
                payload.AlertKind == AppointmentAlertKinds.Booked &&
                payload.Message.Contains("St. Jude Medical Clinic") &&
                payload.Message.Contains("booked") &&
                payload.Message.Contains("Dr. Jose Rizal")));
    }

    [Fact]
    public async Task DispatchAlertAsync_WhenPatientHasNoSyncPatientId_SkipsAlert()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "WalkIn",
            LastName = "Patient",
            PatientCode = "P-101",
            DateOfBirth = new DateOnly(1985, 3, 1),
            ContactNumber = "0917-333-4444",
            CloudPatientId = null // Unlinked patient
        };
        await patientRepo.AddAsync(patient);
        await context.SaveChangesAsync();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "WalkIn Patient",
            ScheduledAt = DateTime.UtcNow.AddDays(2),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Booked, CancellationToken.None);

        // Assert
        publisher.DidNotReceiveWithAnyArgs().Enqueue(
            Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(), Arg.Any<Guid>(), Arg.Any<PatientAppointmentAlertPayload>());
    }

    [Theory]
    [InlineData(AppointmentAlertKinds.Booked, "booked")]
    [InlineData(AppointmentAlertKinds.Rescheduled, "rescheduled")]
    [InlineData(AppointmentAlertKinds.Cancelled, "cancelled")]
    [InlineData(AppointmentAlertKinds.Reminder24h, "tomorrow")]
    [InlineData(AppointmentAlertKinds.Reminder2h, "2 hours")]
    [InlineData(AppointmentAlertKinds.ManualReminder, "upcoming appointment")]
    public async Task DispatchAlertAsync_FormatsClearHumanReadableMessages_ForAllAlertKinds(string alertKind, string expectedKeyword)
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
            LastName = "User",
            PatientCode = "P-200",
            DateOfBirth = new DateOnly(2000, 1, 1),
            ContactNumber = "0917-555-6666",
            CloudPatientId = syncPatientId
        };
        await patientRepo.AddAsync(patient);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Apex Dental and Medical Clinic"
        };
        await settingsRepo.AddAsync(settings);
        await context.SaveChangesAsync();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "Test User",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Santos",
            ServiceType = "Dental Checkup",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchAlertAsync(appointment, alertKind, CancellationToken.None);

        // Assert
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.PatientId == syncPatientId.ToString()),
            appointment.Id,
            Arg.Is<PatientAppointmentAlertPayload>(p =>
                p.AlertKind == alertKind &&
                p.Message.Contains(expectedKeyword, StringComparison.OrdinalIgnoreCase) &&
                p.Message.Contains("Apex Dental and Medical Clinic") &&
                p.Message.Contains("Dr. Santos")));
    }

    [Fact]
    public async Task DispatchAlertAsync_WhenSettingsMissing_UsesFallbackClinicName()
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
            FirstName = "Juan",
            LastName = "Cruz",
            PatientCode = "P-300",
            DateOfBirth = new DateOnly(1980, 1, 1),
            ContactNumber = "0917-777-8888",
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
            PatientName = "Juan Cruz",
            ScheduledAt = DateTime.UtcNow.AddHours(2),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Reminder2h, CancellationToken.None);

        // Assert
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            appointment.Id,
            Arg.Is<PatientAppointmentAlertPayload>(p => p.ClinicName == "Clinic"));
    }

    [Fact]
    public async Task DispatchStaffNotificationAsync_WhenDoctorAssignedAndSettingsEnabled_CreatesStaffNotification()
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
            ClinicName = "Care Clinic",
            EnableStaffAppointmentNotifications = true
        };
        await settingsRepo.AddAsync(settings);
        await context.SaveChangesAsync();

        var doctorId = Guid.NewGuid();
        var scheduledAt = new DateTime(2026, 10, 25, 9, 0, 0, DateTimeKind.Utc);
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            DoctorId = doctorId,
            DoctorName = "Dr. Santos",
            ScheduledAt = scheduledAt,
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchStaffNotificationAsync(appointment, "booked", CancellationToken.None);
        await context.SaveChangesAsync();

        // Assert
        var created = await staffNotificationRepo.FindAsync(n => n.RecipientStaffId == doctorId);
        created.Should().NotBeNull();
        created!.Category.Should().Be(StaffNotificationCategory.Appointment);
        created.RecipientStaffId.Should().Be(doctorId);
        created.RecipientRole.Should().Be("Doctor");
        created.ActionRoute.Should().Be("Appointments");
        created.ActionParamsJson.Should().Be($"{{\"appointmentId\":\"{appointment.Id}\",\"date\":\"2026-10-25\"}}");
        created.Title.Should().Contain("New Appointment: Pedro Penduko");
        created.Body.Should().Contain("Pedro Penduko");
        created.SourceType.Should().Be("Appointment");
        created.SourceId.Should().Be(appointment.Id.ToString());
    }

    [Fact]
    public async Task DispatchStaffNotificationAsync_WhenDoctorIdIsNull_SkipsNotification()
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
            PatientName = "Unassigned Patient",
            DoctorId = null, // No doctor assigned
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchStaffNotificationAsync(appointment, "booked", CancellationToken.None);
        await context.SaveChangesAsync();

        // Assert
        var notifications = await staffNotificationRepo.ToListAsync(staffNotificationRepo.Query());
        notifications.Should().BeEmpty();
    }

    [Fact]
    public async Task DispatchStaffNotificationAsync_WhenStaffNotificationsDisabledInSettings_SkipsNotification()
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
            ClinicName = "Care Clinic",
            EnableStaffAppointmentNotifications = false // Disabled
        };
        await settingsRepo.AddAsync(settings);
        await context.SaveChangesAsync();

        var doctorId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            DoctorId = doctorId,
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchStaffNotificationAsync(appointment, "booked", CancellationToken.None);
        await context.SaveChangesAsync();

        // Assert
        var notifications = await staffNotificationRepo.ToListAsync(staffNotificationRepo.Query());
        notifications.Should().BeEmpty();
    }

    [Theory]
    [InlineData("rescheduled", "Appointment Rescheduled")]
    [InlineData("cancelled", "Appointment Cancelled")]
    public async Task DispatchStaffNotificationAsync_SetsAppropriateTitleAndBody_ForRescheduledAndCancelled(string eventType, string expectedTitlePrefix)
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
            ClinicName = "Care Clinic",
            EnableStaffAppointmentNotifications = true
        };
        await settingsRepo.AddAsync(settings);
        await context.SaveChangesAsync();

        var doctorId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Clara Santos",
            DoctorId = doctorId,
            ScheduledAt = new DateTime(2026, 12, 1, 10, 0, 0, DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed
        };

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        // Act
        await dispatcher.DispatchStaffNotificationAsync(appointment, eventType, CancellationToken.None);
        await context.SaveChangesAsync();

        // Assert
        var created = await staffNotificationRepo.FindAsync(n => n.RecipientStaffId == doctorId);
        created.Should().NotBeNull();
        created!.Title.Should().StartWith(expectedTitlePrefix);
        created.Body.Should().Contain("Clara Santos");
    }
}
