using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Consumers;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class AppointmentBookedConsumerTests
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
            .UseInMemoryDatabase(databaseName: $"ClinicEz_ConsumerTest_{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options, config);
    }

    [Fact]
    public async Task Consume_MatchingClinic_IngestsAppointmentSuccessfully()
    {
        // Arrange
        using var dbContext = CreateDbContext();
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var logger = Substitute.For<ILogger<AppointmentBookedConsumer>>();
        var consumer = new AppointmentBookedConsumer(dbContext, clinicContext, logger);

        var bookedEvent = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PreferredDate = new DateOnly(2026, 9, 25),
            PreferredTime = "10:30",
            Reason = "Follow-up consultation",
            Notes = "Patient has persistent headache",
            CreatedAt = DateTime.UtcNow
        };

        var consumeContext = Substitute.For<ConsumeContext<AppointmentBookedEvent>>();
        consumeContext.Message.Returns(bookedEvent);
        consumeContext.CancellationToken.Returns(CancellationToken.None);

        // Act
        await consumer.Consume(consumeContext);

        // Assert
        var appt = await dbContext.Appointments.FirstOrDefaultAsync(a => a.DraftId == draftId);
        appt.Should().NotBeNull();
        appt!.ClinicId.Should().Be(clinicId);
        appt.PatientId.Should().Be(patientId);
        appt.Status.Should().Be(AppointmentStatus.Confirmed);
        appt.Reason.Should().Be("Follow-up consultation");
        appt.ScheduledAt.Hour.Should().Be(10);
        appt.ScheduledAt.Minute.Should().Be(30);
    }

    [Fact]
    public async Task Consume_DifferentClinic_IgnoresEventDueToJurisdiction()
    {
        // Arrange
        using var dbContext = CreateDbContext();
        var thisClinicId = Guid.NewGuid();
        var otherClinicId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(thisClinicId);

        var logger = Substitute.For<ILogger<AppointmentBookedConsumer>>();
        var consumer = new AppointmentBookedConsumer(dbContext, clinicContext, logger);

        var bookedEvent = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = otherClinicId,
            TenantId = "tenant_test",
            PreferredDate = new DateOnly(2026, 9, 25),
            PreferredTime = "09:00"
        };

        var consumeContext = Substitute.For<ConsumeContext<AppointmentBookedEvent>>();
        consumeContext.Message.Returns(bookedEvent);
        consumeContext.CancellationToken.Returns(CancellationToken.None);

        // Act
        await consumer.Consume(consumeContext);

        // Assert: No appointment saved in this clinic's db
        var count = await dbContext.Appointments.CountAsync();
        count.Should().Be(0);
    }
}
