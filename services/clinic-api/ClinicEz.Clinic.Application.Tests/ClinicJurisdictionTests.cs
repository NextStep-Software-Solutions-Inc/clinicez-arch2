using System;
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

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicJurisdictionTests
{
    [Fact]
    public async Task GlobalQueryFilter_ShieldsDataFromOtherClinics()
    {
        // Arrange
        var clinicAId = Guid.NewGuid();
        var clinicBId = Guid.NewGuid();
        var tenantId = "tenant_multi";

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new System.Collections.Generic.KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var dbName = $"ClinicEz_JurisdictionTest_{Guid.NewGuid()}";
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        // Seed data under both clinics
        using (var seedContext = new ApplicationDbContext(options, config, null))
        {
            var queueItemA = new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicAId,
                QueueNumber = "Q-001",
                SequenceNumber = 1,
                QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Clinic A",
                Priority = QueuePriority.Routine,
                Status = QueueStatus.Waiting
            };

            var queueItemB = new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicBId,
                QueueNumber = "Q-001",
                SequenceNumber = 1,
                QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Clinic B",
                Priority = QueuePriority.Routine,
                Status = QueueStatus.Waiting
            };

            await seedContext.QueueItems.AddRangeAsync(queueItemA, queueItemB);
            await seedContext.SaveChangesAsync();
        }

        // Act: Query through Clinic A scoped context
        var clinicContextA = Substitute.For<IClinicContext>();
        clinicContextA.ClinicId.Returns(clinicAId);
        clinicContextA.TenantId.Returns(tenantId);

        using (var contextA = new ApplicationDbContext(options, config, clinicContextA))
        {
            var visibleQueue = await contextA.QueueItems.ToListAsync();

            // Assert: Clinic A only sees Clinic A's queue item
            visibleQueue.Should().HaveCount(1);
            visibleQueue[0].ClinicId.Should().Be(clinicAId);
            visibleQueue[0].PatientName.Should().Be("Patient Clinic A");
        }
    }
}
