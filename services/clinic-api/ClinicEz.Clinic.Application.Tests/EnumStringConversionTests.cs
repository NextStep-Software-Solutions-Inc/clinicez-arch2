using System;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class EnumStringConversionTests
{
    private ApplicationDbContext CreateDbContext()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new System.Collections.Generic.KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClinicEz_EnumTest_{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options, config);
    }

    [Fact]
    public void ModelBuilder_EnforcesStringConversion_OnAllEnumProperties()
    {
        // Arrange
        using var context = CreateDbContext();
        var model = context.Model;

        // Act & Assert
        var staffRoleProp = model.FindEntityType(typeof(StaffMember))?.FindProperty(nameof(StaffMember.Role));
        staffRoleProp.Should().NotBeNull();
        staffRoleProp!.GetValueConverter().Should().NotBeNull();
        staffRoleProp.GetValueConverter()!.ProviderClrType.Should().Be(typeof(string));

        var appointmentStatusProp = model.FindEntityType(typeof(Appointment))?.FindProperty(nameof(Appointment.Status));
        appointmentStatusProp.Should().NotBeNull();
        appointmentStatusProp!.GetValueConverter().Should().NotBeNull();
        appointmentStatusProp.GetValueConverter()!.ProviderClrType.Should().Be(typeof(string));

        var queuePriorityProp = model.FindEntityType(typeof(QueueItem))?.FindProperty(nameof(QueueItem.Priority));
        queuePriorityProp.Should().NotBeNull();
        queuePriorityProp!.GetValueConverter().Should().NotBeNull();
        queuePriorityProp.GetValueConverter()!.ProviderClrType.Should().Be(typeof(string));

        var queueStatusProp = model.FindEntityType(typeof(QueueItem))?.FindProperty(nameof(QueueItem.Status));
        queueStatusProp.Should().NotBeNull();
        queueStatusProp!.GetValueConverter().Should().NotBeNull();
        queueStatusProp.GetValueConverter()!.ProviderClrType.Should().Be(typeof(string));
    }

    [Fact]
    public async Task EntitiesWithEnums_PersistAndRetrieveCorrectly()
    {
        // Arrange
        using var context = CreateDbContext();
        var tenantId = "tenant_test";
        var clinicId = Guid.NewGuid();

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-123456"
        };

        var appt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            Status = AppointmentStatus.CheckedIn,
            ScheduledAt = DateTime.UtcNow
        };

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = appt.PatientId,
            PatientName = appt.PatientName,
            Priority = QueuePriority.Urgent,
            Status = QueueStatus.Triaged
        };

        // Act
        await context.StaffMembers.AddAsync(staff);
        await context.Appointments.AddAsync(appt);
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        // Assert
        var fetchedStaff = await context.StaffMembers.IgnoreQueryFilters().FirstAsync(s => s.Id == staff.Id);
        fetchedStaff.Role.Should().Be(StaffRole.Doctor);

        var fetchedAppt = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt.Id);
        fetchedAppt.Status.Should().Be(AppointmentStatus.CheckedIn);

        var fetchedQueue = await context.QueueItems.IgnoreQueryFilters().FirstAsync(q => q.Id == queueItem.Id);
        fetchedQueue.Priority.Should().Be(QueuePriority.Urgent);
        fetchedQueue.Status.Should().Be(QueueStatus.Triaged);
    }
}
