namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

public class AuditJurisdictionTests
{
    private static (ApplicationDbContext context, Guid clinicAId, Guid clinicBId, string tenantId, DbContextOptions<ApplicationDbContext> options, IConfiguration config)
        CreateTestContext()
    {
        var clinicAId = Guid.NewGuid();
        var clinicBId = Guid.NewGuid();
        var tenantId = "tenant_audit_test";

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new System.Collections.Generic.KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var dbName = $"ClinicEz_AuditJurisdictionTest_{Guid.NewGuid()}";
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return (new ApplicationDbContext(options, config, null), clinicAId, clinicBId, tenantId, options, config);
    }

    [Fact]
    public async Task GlobalQueryFilter_ShieldsAuditEntriesFromOtherClinics()
    {
        // Arrange
        var (seedContext, clinicAId, clinicBId, tenantId, options, config) = CreateTestContext();

        using (seedContext)
        {
            var entryA = new AuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicAId,
                Timestamp = DateTime.UtcNow,
                Category = "Security",
                Severity = "Emergency",
                Action = "auth.login.failure",
                ActorName = "Attacker A",
                ActorRole = "Unknown",
                TargetEntityType = "StaffMember",
                TargetEntityId = "staff-001",
                Outcome = "Failure",
                Description = "Failed login attempt for Clinic A staff"
            };

            var entryB = new AuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicBId,
                Timestamp = DateTime.UtcNow,
                Category = "Clinical",
                Severity = "Routine",
                Action = "clinical.consultation.signed",
                ActorName = "Dr. B",
                ActorRole = "Doctor",
                TargetEntityType = "ConsultationEncounter",
                TargetEntityId = "enc-002",
                Outcome = "Success",
                Description = "Consultation signed for Clinic B"
            };

            await seedContext.AuditEntries.AddRangeAsync(entryA, entryB);
            await seedContext.SaveChangesAsync();
        }

        // Act: Query through Clinic A scoped context
        var clinicContextA = Substitute.For<IClinicContext>();
        clinicContextA.ClinicId.Returns(clinicAId);
        clinicContextA.TenantId.Returns(tenantId);

        using (var contextA = new ApplicationDbContext(options, config, clinicContextA))
        {
            var visibleAudit = await contextA.AuditEntries.ToListAsync();

            // Assert: Clinic A only sees Clinic A's audit entry
            visibleAudit.Should().HaveCount(1);
            visibleAudit[0].ClinicId.Should().Be(clinicAId);
            visibleAudit[0].Action.Should().Be("auth.login.failure");
            visibleAudit[0].Description.Should().Contain("Clinic A");
        }

        // Act: Query through Clinic B scoped context
        var clinicContextB = Substitute.For<IClinicContext>();
        clinicContextB.ClinicId.Returns(clinicBId);
        clinicContextB.TenantId.Returns(tenantId);

        using (var contextB = new ApplicationDbContext(options, config, clinicContextB))
        {
            var visibleAuditB = await contextB.AuditEntries.ToListAsync();

            // Assert: Clinic B only sees Clinic B's audit entry
            visibleAuditB.Should().HaveCount(1);
            visibleAuditB[0].ClinicId.Should().Be(clinicBId);
            visibleAuditB[0].Action.Should().Be("clinical.consultation.signed");
            visibleAuditB[0].Description.Should().Contain("Clinic B");
        }
    }

    [Fact]
    public async Task QueryAuditEntries_WithUnauthenticatedOrUnknownClinic_ReturnsZeroRecords()
    {
        // Arrange
        var (seedContext, clinicAId, _, tenantId, options, config) = CreateTestContext();

        using (seedContext)
        {
            await seedContext.AuditEntries.AddAsync(new AuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicAId,
                Timestamp = DateTime.UtcNow,
                Category = "Security",
                Severity = "Routine",
                Action = "auth.login.success",
                ActorName = "Admin",
                ActorRole = "Admin",
                TargetEntityType = "StaffMember",
                Outcome = "Success",
                Description = "Admin logged in"
            });
            await seedContext.SaveChangesAsync();
        }

        // Act: Query with arbitrary foreign clinic ID
        var foreignContext = Substitute.For<IClinicContext>();
        foreignContext.ClinicId.Returns(Guid.NewGuid());
        foreignContext.TenantId.Returns(tenantId);

        using (var queryContext = new ApplicationDbContext(options, config, foreignContext))
        {
            var results = await queryContext.AuditEntries.ToListAsync();

            // Assert
            results.Should().BeEmpty();
        }
    }

    [Fact]
    public async Task QueryAuditEntries_WithIgnoreQueryFilters_ReturnsAllClinics()
    {
        // Arrange
        var (seedContext, clinicAId, clinicBId, tenantId, options, config) = CreateTestContext();

        using (seedContext)
        {
            await seedContext.AuditEntries.AddRangeAsync(
                new AuditEntry
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicAId,
                    Category = "Billing",
                    Severity = "Routine",
                    Action = "billing.invoice.created",
                    ActorName = "Cashier A",
                    ActorRole = "Cashier",
                    TargetEntityType = "Invoice",
                    Outcome = "Success",
                    Description = "Invoice created"
                },
                new AuditEntry
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicBId,
                    Category = "Billing",
                    Severity = "Emergency",
                    Action = "billing.invoice.voided",
                    ActorName = "Supervisor B",
                    ActorRole = "Supervisor",
                    TargetEntityType = "Invoice",
                    Outcome = "Success",
                    Description = "Invoice voided"
                }
            );
            await seedContext.SaveChangesAsync();
        }

        var clinicContextA = Substitute.For<IClinicContext>();
        clinicContextA.ClinicId.Returns(clinicAId);

        using (var queryContext = new ApplicationDbContext(options, config, clinicContextA))
        {
            var allEntries = await queryContext.AuditEntries.IgnoreQueryFilters().ToListAsync();
            allEntries.Should().HaveCount(2);
        }
    }
}
