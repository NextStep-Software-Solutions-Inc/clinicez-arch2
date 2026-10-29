using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Challenger Verification Suite for Milestone 2:
/// Empirically verifies Appointment reminder fields, DbContext composite index configurations,
/// StaffNotificationCategory enum values, and EF Core queryability.
/// </summary>
public class Milestone2ReminderVerificationTests
{
    private static ApplicationDbContext CreateTestDbContext(Guid clinicId, string tenantId)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClinicEz_M2ApptTest_{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    [Fact]
    public void AppointmentEntity_DefaultValuesAndNullability_ConformToSpecification()
    {
        // Act
        var appointment = new Appointment
        {
            PatientName = "Test Patient"
        };

        // Assert - Booleans default to false
        appointment.Reminder24hSent.Should().BeFalse(because: "R3 specifies unreminded appointments start with Reminder24hSent = false");
        appointment.Reminder2hSent.Should().BeFalse(because: "R3 specifies unreminded appointments start with Reminder2hSent = false");

        // Assert - Nullable timestamps default to null
        appointment.Reminder24hSentAt.Should().BeNull();
        appointment.Reminder2hSentAt.Should().BeNull();
        appointment.LastReminderSentAt.Should().BeNull();
        appointment.LastReminderType.Should().BeNull();
    }

    [Fact]
    public void StaffNotification_StaffNotificationCategory_AppointmentValueEqualsFour()
    {
        // Assert - Category enum value
        ((int)StaffNotificationCategory.Appointment).Should().Be(4, because: "R4 requires Appointment = 4 in StaffNotificationCategory");
        StaffNotificationCategory.Appointment.ToString().Should().Be("Appointment");
    }

    [Fact]
    public void DbContextModel_AppointmentIndices_CompositeIndicesExistInEFCoreModel()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-emp-test";
        using var db = CreateTestDbContext(clinicId, tenantId);

        var entityType = db.Model.FindEntityType(typeof(Appointment));
        entityType.Should().NotBeNull();

        var indices = entityType!.GetIndexes().ToList();

        // Check composite index: Status, ScheduledAt, Reminder24hSent
        var index24h = indices.FirstOrDefault(idx =>
            idx.Properties.Select(p => p.Name).SequenceEqual(new[] { "Status", "ScheduledAt", "Reminder24hSent" }));
        index24h.Should().NotBeNull("Composite index on (Status, ScheduledAt, Reminder24hSent) must be registered in DbContext");

        // Check composite index: Status, ScheduledAt, Reminder2hSent
        var index2h = indices.FirstOrDefault(idx =>
            idx.Properties.Select(p => p.Name).SequenceEqual(new[] { "Status", "ScheduledAt", "Reminder2hSent" }));
        index2h.Should().NotBeNull("Composite index on (Status, ScheduledAt, Reminder2hSent) must be registered in DbContext");
    }

    [Fact]
    public async Task DbContext_AppointmentReminderFields_PersistAndQueryCorrectly()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-emp-test";
        using var db = CreateTestDbContext(clinicId, tenantId);

        var now = DateTime.UtcNow;
        var appt1 = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Maria Santos",
            ScheduledAt = now.AddHours(24),
            EndTimeUtc = now.AddHours(24).AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };

        var appt2 = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Maria Santos",
            ScheduledAt = now.AddHours(2),
            EndTimeUtc = now.AddHours(2).AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = true,
            Reminder24hSentAt = now.AddHours(-22),
            Reminder2hSent = false,
            LastReminderSentAt = now.AddHours(-22),
            LastReminderType = "24h"
        };

        db.Appointments.AddRange(appt1, appt2);
        await db.SaveChangesAsync();

        // Act 1: Query unreminded 24h appointments (matching composite index query pattern)
        var unreminded24h = await db.Appointments
            .Where(a => a.Status == AppointmentStatus.Confirmed && a.Reminder24hSent == false)
            .ToListAsync();

        unreminded24h.Should().HaveCount(1);
        unreminded24h[0].Id.Should().Be(appt1.Id);

        // Act 2: Update reminder state on appt1
        var sentAt = DateTime.UtcNow;
        appt1.Reminder24hSent = true;
        appt1.Reminder24hSentAt = sentAt;
        appt1.LastReminderSentAt = sentAt;
        appt1.LastReminderType = "24h";
        await db.SaveChangesAsync();

        // Assert 2: Verify persistence
        var reloaded = await db.Appointments.FindAsync(appt1.Id);
        reloaded.Should().NotBeNull();
        reloaded!.Reminder24hSent.Should().BeTrue();
        reloaded.Reminder24hSentAt.Should().Be(sentAt);
        reloaded.LastReminderSentAt.Should().Be(sentAt);
        reloaded.LastReminderType.Should().Be("24h");
    }
}
