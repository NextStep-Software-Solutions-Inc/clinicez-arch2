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

public class AuditWormImmutabilityTests
{
    private static ApplicationDbContext CreateContext(Guid clinicId, string tenantId = "tenant_worm")
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new System.Collections.Generic.KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClinicEz_WormTest_{Guid.NewGuid()}")
            .Options;

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        return new ApplicationDbContext(options, config, clinicContext);
    }

    [Fact]
    public async Task AddAuditEntry_SucceedsAndPersists()
    {
        var clinicId = Guid.NewGuid();
        using var db = CreateContext(clinicId);

        var entry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_worm",
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = "Clinical",
            Severity = "Routine",
            Action = "clinical.consultation.signed",
            ActorName = "Dr. Santos",
            ActorRole = "Doctor",
            TargetEntityType = "ConsultationEncounter",
            TargetEntityId = Guid.NewGuid().ToString(),
            Outcome = "Success",
            Description = "Consultation successfully signed"
        };

        await db.ClinicAuditEntries.AddAsync(entry);
        var saveCount = await db.SaveChangesAsync();

        saveCount.Should().BeGreaterThan(0);
        var saved = await db.ClinicAuditEntries.FindAsync(entry.Id);
        saved.Should().NotBeNull();
        saved!.Action.Should().Be("clinical.consultation.signed");
    }

    [Fact]
    public async Task AddAuditEntry_WithIsDeletedTrue_ThrowsInvalidOperationException()
    {
        var clinicId = Guid.NewGuid();
        using var db = CreateContext(clinicId);

        var entry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_worm",
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = "Clinical",
            Severity = "Routine",
            Action = "clinical.consultation.signed",
            ActorName = "Dr. Santos",
            ActorRole = "Doctor",
            TargetEntityType = "ConsultationEncounter",
            TargetEntityId = Guid.NewGuid().ToString(),
            Outcome = "Success",
            Description = "Consultation successfully signed",
            IsDeleted = true // Attempt pre-deleted insertion
        };

        await db.ClinicAuditEntries.AddAsync(entry);

        var act = () => db.SaveChangesAsync();
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
    }

    [Fact]
    public async Task UpdateAuditEntry_ThrowsInvalidOperationException()
    {
        var clinicId = Guid.NewGuid();
        using var db = CreateContext(clinicId);

        var entry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_worm",
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = "Billing",
            Severity = "Emergency",
            Action = "billing.invoice.voided",
            ActorName = "Cashier",
            ActorRole = "Cashier",
            TargetEntityType = "Invoice",
            Outcome = "Success",
            Description = "Original void reason: customer duplicate"
        };

        await db.ClinicAuditEntries.AddAsync(entry);
        await db.SaveChangesAsync();

        // Attempt mutation
        entry.Description = "Tampered void reason: accidental click";

        var act = () => db.SaveChangesAsync();
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
    }

    [Fact]
    public async Task DeleteAuditEntry_ThrowsInvalidOperationException()
    {
        var clinicId = Guid.NewGuid();
        using var db = CreateContext(clinicId);

        var entry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_worm",
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = "Security",
            Severity = "Emergency",
            Action = "auth.login.failure",
            ActorName = "Intruder",
            ActorRole = "None",
            TargetEntityType = "StaffMember",
            Outcome = "Failure",
            Description = "Failed brute force login"
        };

        await db.ClinicAuditEntries.AddAsync(entry);
        await db.SaveChangesAsync();

        // Attempt hard delete
        db.ClinicAuditEntries.Remove(entry);

        var act = () => db.SaveChangesAsync();
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
    }

    [Fact]
    public void SynchronousSaveChanges_EnforcesWormImmutability()
    {
        var clinicId = Guid.NewGuid();
        using var db = CreateContext(clinicId);

        var entry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_worm",
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = "PhilHealth",
            Severity = "Urgent",
            Action = "yakap.claim.rejected",
            ActorName = "Yakap System",
            ActorRole = "System",
            TargetEntityType = "YakapTransmittal",
            Outcome = "Failure",
            Description = "Rejected by PhilHealth SOAP validator"
        };

        db.ClinicAuditEntries.Add(entry);
        db.SaveChanges();

        // Attempt soft-delete mutation
        entry.IsDeleted = true;

        var act = () => db.SaveChanges();
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
    }

    [Fact]
    public async Task UpdateAuditEntry_FromSeparateContext_ThrowsInvalidOperationException()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"ClinicEz_WormCrossContext_{Guid.NewGuid()}";
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new System.Collections.Generic.KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_worm");

        var entryId = Guid.NewGuid();
        using (var db1 = new ApplicationDbContext(options, config, clinicContext))
        {
            db1.ClinicAuditEntries.Add(new ClinicAuditEntry
            {
                Id = entryId,
                TenantId = "tenant_worm",
                ClinicId = clinicId,
                Category = "Operations",
                Severity = "Routine",
                Action = "operations.template.updated",
                ActorName = "Admin",
                ActorRole = "Admin",
                TargetEntityType = "ClinicSettings",
                Outcome = "Success",
                Description = "Updated settings"
            });
            await db1.SaveChangesAsync();
        }

        using (var db2 = new ApplicationDbContext(options, config, clinicContext))
        {
            var loaded = await db2.ClinicAuditEntries.FindAsync(entryId);
            loaded.Should().NotBeNull();
            loaded!.Description = "Tampered in second context";

            var act = () => db2.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
        }
    }
}
