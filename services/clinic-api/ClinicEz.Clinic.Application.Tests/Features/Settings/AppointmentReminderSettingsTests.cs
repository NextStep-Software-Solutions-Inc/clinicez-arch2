using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

public class AppointmentReminderSettingsTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-settings-adversarial-test";

    public AppointmentReminderSettingsTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public void ClinicSettings_DirectInstantiation_HasAllFourReminderFlagsDefaultedToTrue()
    {
        // Arrange & Act
        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicName = "Test Clinic"
        };

        // Assert
        settings.EnableAppointmentReminders.Should().BeTrue();
        settings.AppointmentReminder24hEnabled.Should().BeTrue();
        settings.AppointmentReminder2hEnabled.Should().BeTrue();
        settings.EnableStaffAppointmentNotifications.Should().BeTrue();
    }

    [Fact]
    public void ClinicSettingsDto_DefaultConstructor_HasAllFourReminderFlagsDefaultedToTrue()
    {
        // Arrange & Act
        var dto = new ClinicSettingsDto(
            Id: Guid.NewGuid(),
            TenantId: _testTenantId,
            ClinicId: _testClinicId,
            ClinicName: "Test Clinic",
            TaxIdentificationNumber: "000-000-000",
            AccreditationNumber: "ACC-123",
            OperatingHours: "08:00 - 17:00",
            DefaultSlotDurationMinutes: 30,
            QueuePrefix: "Q",
            InvoicePrefix: "INV",
            DefaultConsultationFee: 500m,
            VatRate: 0.12m,
            LetterheadHeader: null,
            LetterheadSubHeader: null,
            LetterheadAddress: null,
            LetterheadContact: null,
            LetterheadFooter: null);

        // Assert
        dto.EnableAppointmentReminders.Should().BeTrue();
        dto.AppointmentReminder24hEnabled.Should().BeTrue();
        dto.AppointmentReminder2hEnabled.Should().BeTrue();
        dto.EnableStaffAppointmentNotifications.Should().BeTrue();
    }

    [Fact]
    public void StaffNotificationCategory_AppointmentEnum_HasExpectedValueFour()
    {
        // Arrange & Act & Assert
        ((int)StaffNotificationCategory.Appointment).Should().Be(4);
        StaffNotificationCategory.Appointment.ToString().Should().Be("Appointment");
    }

    [Fact]
    public async Task GetClinicSettings_WhenNoSettingsExist_AutoProvisionsWithAllReminderFlagsTrue()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Assert DTO
        result.Should().NotBeNull();
        result.EnableAppointmentReminders.Should().BeTrue();
        result.AppointmentReminder24hEnabled.Should().BeTrue();
        result.AppointmentReminder2hEnabled.Should().BeTrue();
        result.EnableStaffAppointmentNotifications.Should().BeTrue();

        // Assert persisted entity in DB
        var persisted = await context.ClinicSettings.FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted.Should().NotBeNull();
        persisted!.EnableAppointmentReminders.Should().BeTrue();
        persisted.AppointmentReminder24hEnabled.Should().BeTrue();
        persisted.AppointmentReminder2hEnabled.Should().BeTrue();
        persisted.EnableStaffAppointmentNotifications.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingOnlyEnableAppointmentReminders_LeavesOtherFlagsUnchanged()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);
        var getHandler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Initial provisioning (all true)
        await getHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Act: Update only EnableAppointmentReminders to false
        var command = new UpdateClinicSettingsCommand(
            EnableAppointmentReminders: false);

        var result = await updateHandler.Handle(command, CancellationToken.None);

        // Assert
        result.EnableAppointmentReminders.Should().BeFalse();
        result.AppointmentReminder24hEnabled.Should().BeTrue("24h reminder should remain untouched");
        result.AppointmentReminder2hEnabled.Should().BeTrue("2h reminder should remain untouched");
        result.EnableStaffAppointmentNotifications.Should().BeTrue("Staff notifications should remain untouched");

        // Verify direct DB query
        var persisted = await context.ClinicSettings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.EnableAppointmentReminders.Should().BeFalse();
        persisted.AppointmentReminder24hEnabled.Should().BeTrue();
        persisted.AppointmentReminder2hEnabled.Should().BeTrue();
        persisted.EnableStaffAppointmentNotifications.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingOnlyAppointmentReminder24hEnabled_LeavesOtherFlagsUnchanged()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);
        var getHandler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        await getHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Act: Update only AppointmentReminder24hEnabled to false
        var command = new UpdateClinicSettingsCommand(
            AppointmentReminder24hEnabled: false);

        var result = await updateHandler.Handle(command, CancellationToken.None);

        // Assert
        result.EnableAppointmentReminders.Should().BeTrue("Master reminders should remain untouched");
        result.AppointmentReminder24hEnabled.Should().BeFalse();
        result.AppointmentReminder2hEnabled.Should().BeTrue("2h reminder should remain untouched");
        result.EnableStaffAppointmentNotifications.Should().BeTrue("Staff notifications should remain untouched");

        var persisted = await context.ClinicSettings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.EnableAppointmentReminders.Should().BeTrue();
        persisted.AppointmentReminder24hEnabled.Should().BeFalse();
        persisted.AppointmentReminder2hEnabled.Should().BeTrue();
        persisted.EnableStaffAppointmentNotifications.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingOnlyAppointmentReminder2hEnabled_LeavesOtherFlagsUnchanged()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);
        var getHandler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        await getHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Act: Update only AppointmentReminder2hEnabled to false
        var command = new UpdateClinicSettingsCommand(
            AppointmentReminder2hEnabled: false);

        var result = await updateHandler.Handle(command, CancellationToken.None);

        // Assert
        result.EnableAppointmentReminders.Should().BeTrue("Master reminders should remain untouched");
        result.AppointmentReminder24hEnabled.Should().BeTrue("24h reminder should remain untouched");
        result.AppointmentReminder2hEnabled.Should().BeFalse();
        result.EnableStaffAppointmentNotifications.Should().BeTrue("Staff notifications should remain untouched");

        var persisted = await context.ClinicSettings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.EnableAppointmentReminders.Should().BeTrue();
        persisted.AppointmentReminder24hEnabled.Should().BeTrue();
        persisted.AppointmentReminder2hEnabled.Should().BeFalse();
        persisted.EnableStaffAppointmentNotifications.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingOnlyEnableStaffAppointmentNotifications_LeavesOtherFlagsUnchanged()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);
        var getHandler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        await getHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Act: Update only EnableStaffAppointmentNotifications to false
        var command = new UpdateClinicSettingsCommand(
            EnableStaffAppointmentNotifications: false);

        var result = await updateHandler.Handle(command, CancellationToken.None);

        // Assert
        result.EnableAppointmentReminders.Should().BeTrue("Master reminders should remain untouched");
        result.AppointmentReminder24hEnabled.Should().BeTrue("24h reminder should remain untouched");
        result.AppointmentReminder2hEnabled.Should().BeTrue("2h reminder should remain untouched");
        result.EnableStaffAppointmentNotifications.Should().BeFalse();

        var persisted = await context.ClinicSettings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.EnableAppointmentReminders.Should().BeTrue();
        persisted.AppointmentReminder24hEnabled.Should().BeTrue();
        persisted.AppointmentReminder2hEnabled.Should().BeTrue();
        persisted.EnableStaffAppointmentNotifications.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateClinicSettings_UpdatingAllFourFlagsSimultaneously_PersistsCorrectly()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);
        var getHandler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        await getHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // 1. Act: Set all 4 flags to false simultaneously
        var cmdAllFalse = new UpdateClinicSettingsCommand(
            EnableAppointmentReminders: false,
            AppointmentReminder24hEnabled: false,
            AppointmentReminder2hEnabled: false,
            EnableStaffAppointmentNotifications: false);

        var resAllFalse = await updateHandler.Handle(cmdAllFalse, CancellationToken.None);

        // Assert all false
        resAllFalse.EnableAppointmentReminders.Should().BeFalse();
        resAllFalse.AppointmentReminder24hEnabled.Should().BeFalse();
        resAllFalse.AppointmentReminder2hEnabled.Should().BeFalse();
        resAllFalse.EnableStaffAppointmentNotifications.Should().BeFalse();

        var persistedAllFalse = await context.ClinicSettings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persistedAllFalse!.EnableAppointmentReminders.Should().BeFalse();
        persistedAllFalse.AppointmentReminder24hEnabled.Should().BeFalse();
        persistedAllFalse.AppointmentReminder2hEnabled.Should().BeFalse();
        persistedAllFalse.EnableStaffAppointmentNotifications.Should().BeFalse();

        // 2. Act: Set alternating flags simultaneously (true, false, true, false)
        var cmdAlternating = new UpdateClinicSettingsCommand(
            EnableAppointmentReminders: true,
            AppointmentReminder24hEnabled: false,
            AppointmentReminder2hEnabled: true,
            EnableStaffAppointmentNotifications: false);

        var resAlternating = await updateHandler.Handle(cmdAlternating, CancellationToken.None);

        // Assert alternating
        resAlternating.EnableAppointmentReminders.Should().BeTrue();
        resAlternating.AppointmentReminder24hEnabled.Should().BeFalse();
        resAlternating.AppointmentReminder2hEnabled.Should().BeTrue();
        resAlternating.EnableStaffAppointmentNotifications.Should().BeFalse();

        var persistedAlternating = await context.ClinicSettings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persistedAlternating!.EnableAppointmentReminders.Should().BeTrue();
        persistedAlternating.AppointmentReminder24hEnabled.Should().BeFalse();
        persistedAlternating.AppointmentReminder2hEnabled.Should().BeTrue();
        persistedAlternating.EnableStaffAppointmentNotifications.Should().BeFalse();

        // 3. Act: Set all 4 back to true simultaneously
        var cmdAllTrue = new UpdateClinicSettingsCommand(
            EnableAppointmentReminders: true,
            AppointmentReminder24hEnabled: true,
            AppointmentReminder2hEnabled: true,
            EnableStaffAppointmentNotifications: true);

        var resAllTrue = await updateHandler.Handle(cmdAllTrue, CancellationToken.None);

        // Assert all true
        resAllTrue.EnableAppointmentReminders.Should().BeTrue();
        resAllTrue.AppointmentReminder24hEnabled.Should().BeTrue();
        resAllTrue.AppointmentReminder2hEnabled.Should().BeTrue();
        resAllTrue.EnableStaffAppointmentNotifications.Should().BeTrue();

        var persistedAllTrue = await context.ClinicSettings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persistedAllTrue!.EnableAppointmentReminders.Should().BeTrue();
        persistedAllTrue.AppointmentReminder24hEnabled.Should().BeTrue();
        persistedAllTrue.AppointmentReminder2hEnabled.Should().BeTrue();
        persistedAllTrue.EnableStaffAppointmentNotifications.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenReminderFlagsAreNull_PreservesExistingCustomValues()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Set up custom configuration: (false, true, false, true)
        await updateHandler.Handle(new UpdateClinicSettingsCommand(
            EnableAppointmentReminders: false,
            AppointmentReminder24hEnabled: true,
            AppointmentReminder2hEnabled: false,
            EnableStaffAppointmentNotifications: true), CancellationToken.None);

        // Act: Update only unrelated field (ClinicName), leaving all reminder flags as null
        var updateOther = new UpdateClinicSettingsCommand(
            ClinicName: "Renamed Clinic Medical Center");

        var result = await updateHandler.Handle(updateOther, CancellationToken.None);

        // Assert: Unrelated field is updated, all reminder flags are strictly preserved
        result.ClinicName.Should().Be("Renamed Clinic Medical Center");
        result.EnableAppointmentReminders.Should().BeFalse();
        result.AppointmentReminder24hEnabled.Should().BeTrue();
        result.AppointmentReminder2hEnabled.Should().BeFalse();
        result.EnableStaffAppointmentNotifications.Should().BeTrue();

        var persisted = await context.ClinicSettings.AsNoTracking().FirstOrDefaultAsync(s => s.ClinicId == _testClinicId);
        persisted!.ClinicName.Should().Be("Renamed Clinic Medical Center");
        persisted.EnableAppointmentReminders.Should().BeFalse();
        persisted.AppointmentReminder24hEnabled.Should().BeTrue();
        persisted.AppointmentReminder2hEnabled.Should().BeFalse();
        persisted.EnableStaffAppointmentNotifications.Should().BeTrue();
    }

    [Fact]
    public async Task ClinicSettings_MultiClinicIsolation_MaintainsIndependentSettings()
    {
        // Arrange
        var dbName = $"ClinicEz_MultiClinic_Settings_{Guid.NewGuid()}";

        // Clinic 1
        var clinic1Id = Guid.NewGuid();
        var context1 = Substitute.For<IClinicContext>();
        context1.ClinicId.Returns(clinic1Id);
        context1.TenantId.Returns(_testTenantId);

        var (db1, uow1, sieve1) = TestDbHelper.CreateSharedTestContext(dbName, context1);
        var repo1 = TestDbHelper.CreateRepository<ClinicSettings>(db1, sieve1);
        var updateHandler1 = new UpdateClinicSettingsCommandHandler(repo1, context1, uow1);
        var getHandler1 = new GetClinicSettingsQueryHandler(repo1, context1, uow1);

        // Clinic 2
        var clinic2Id = Guid.NewGuid();
        var context2 = Substitute.For<IClinicContext>();
        context2.ClinicId.Returns(clinic2Id);
        context2.TenantId.Returns(_testTenantId);

        var (db2, uow2, sieve2) = TestDbHelper.CreateSharedTestContext(dbName, context2);
        var repo2 = TestDbHelper.CreateRepository<ClinicSettings>(db2, sieve2);
        var getHandler2 = new GetClinicSettingsQueryHandler(repo2, context2, uow2);
        var updateHandler2 = new UpdateClinicSettingsCommandHandler(repo2, context2, uow2);

        // Act 1: Clinic 1 disables all reminders
        await updateHandler1.Handle(new UpdateClinicSettingsCommand(
            EnableAppointmentReminders: false,
            AppointmentReminder24hEnabled: false,
            AppointmentReminder2hEnabled: false,
            EnableStaffAppointmentNotifications: false), CancellationToken.None);

        // Act 2: Clinic 2 queries its settings (should auto-provision defaults: all true)
        var clinic2Settings = await getHandler2.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Assert: Clinic 2 has all true defaults despite Clinic 1 having all false
        clinic2Settings.EnableAppointmentReminders.Should().BeTrue();
        clinic2Settings.AppointmentReminder24hEnabled.Should().BeTrue();
        clinic2Settings.AppointmentReminder2hEnabled.Should().BeTrue();
        clinic2Settings.EnableStaffAppointmentNotifications.Should().BeTrue();

        // Act 3: Clinic 2 disables only 2h reminders
        await updateHandler2.Handle(new UpdateClinicSettingsCommand(
            AppointmentReminder2hEnabled: false), CancellationToken.None);

        // Assert: Clinic 1 remains completely unchanged (all false)
        var clinic1Settings = await getHandler1.Handle(new GetClinicSettingsQuery(), CancellationToken.None);
        clinic1Settings.EnableAppointmentReminders.Should().BeFalse();
        clinic1Settings.AppointmentReminder24hEnabled.Should().BeFalse();
        clinic1Settings.AppointmentReminder2hEnabled.Should().BeFalse();
        clinic1Settings.EnableStaffAppointmentNotifications.Should().BeFalse();
    }

    [Fact]
    public void ApplicationDbContext_ModelConfiguration_RegistersIndicesAndDefaults()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var model = context.Model;

        // 1. Verify ClinicSettings entity defaults
        var clinicSettingsEntity = model.FindEntityType(typeof(ClinicSettings));
        clinicSettingsEntity.Should().NotBeNull();

        var enableRemindersProp = clinicSettingsEntity!.FindProperty(nameof(ClinicSettings.EnableAppointmentReminders));
        enableRemindersProp.Should().NotBeNull();
        enableRemindersProp!.GetDefaultValue().Should().Be(true);

        var rem24hProp = clinicSettingsEntity.FindProperty(nameof(ClinicSettings.AppointmentReminder24hEnabled));
        rem24hProp.Should().NotBeNull();
        rem24hProp!.GetDefaultValue().Should().Be(true);

        var rem2hProp = clinicSettingsEntity.FindProperty(nameof(ClinicSettings.AppointmentReminder2hEnabled));
        rem2hProp.Should().NotBeNull();
        rem2hProp!.GetDefaultValue().Should().Be(true);

        var staffNotifProp = clinicSettingsEntity.FindProperty(nameof(ClinicSettings.EnableStaffAppointmentNotifications));
        staffNotifProp.Should().NotBeNull();
        staffNotifProp!.GetDefaultValue().Should().Be(true);

        // 2. Verify Appointment entity composite indices
        var appointmentEntity = model.FindEntityType(typeof(Appointment));
        appointmentEntity.Should().NotBeNull();

        var indices = appointmentEntity!.GetIndexes().ToList();

        var index24h = indices.FirstOrDefault(i =>
            i.Properties.Select(p => p.Name).SequenceEqual(new[]
            {
                nameof(Appointment.Status),
                nameof(Appointment.ScheduledAt),
                nameof(Appointment.Reminder24hSent)
            }));
        index24h.Should().NotBeNull("Composite index on (Status, ScheduledAt, Reminder24hSent) must be registered");

        var index2h = indices.FirstOrDefault(i =>
            i.Properties.Select(p => p.Name).SequenceEqual(new[]
            {
                nameof(Appointment.Status),
                nameof(Appointment.ScheduledAt),
                nameof(Appointment.Reminder2hSent)
            }));
        index2h.Should().NotBeNull("Composite index on (Status, ScheduledAt, Reminder2hSent) must be registered");
    }
}
