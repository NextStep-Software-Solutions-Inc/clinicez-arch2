using System;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Options;
using ClinicEz.MediaBroker.Application.Services;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.MediaBroker.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.MediaBroker.Tests;

public class AdversarialMediaBrokerTests
{
    private static MediaBrokerDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    [Fact]
    public async Task EvaluateCallAdmission_NullOrWhitespaceTenantId_ThrowsArgumentException()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var actNull = () => service.EvaluateCallAdmissionAsync(null!);
        var actEmpty = () => service.EvaluateCallAdmissionAsync("   ");

        await actNull.Should().ThrowAsync<ArgumentException>();
        await actEmpty.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task EvaluateCallAdmission_DefaultOptions_ZeroMutationAssertion_OnRejectedCall()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var tenantId = "tenant-hostile-unregistered";
        var decision = await service.EvaluateCallAdmissionAsync(tenantId);

        decision.Allowed.Should().BeFalse();
        decision.Reason.Should().Be("Tenant teleconsultation entitlement is inactive.");
        decision.IsOverdraft.Should().BeFalse();

        // Strict zero mutation assertion
        (await db.Entitlements.AnyAsync()).Should().BeFalse("zero entitlements must be created when unprovisioned");
        (await db.AuditLogs.AnyAsync()).Should().BeFalse("zero audit entries must be logged on unconfigured rejection");
        (await db.MonthlyUsages.AnyAsync()).Should().BeFalse("zero usage entries must be logged");
        (await db.CallSessions.AnyAsync()).Should().BeFalse("zero call sessions must be touched");
    }

    [Fact]
    public async Task EvaluateCallAdmission_AutoProvision_WithZeroDefaultMinutes_RejectsCallWithoutCreatingEntitlement()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var options = Options.Create(new MediaMeteringOptions
        {
            AutoProvisionDefaultEntitlement = true,
            DefaultCallMinutesMonthly = 0 // Invalid/Zero configured pool
        });
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance, options);

        var decision = await service.EvaluateCallAdmissionAsync("tenant-zero-pool");

        decision.Allowed.Should().BeFalse();
        decision.Reason.Should().Be("Tenant teleconsultation entitlement is inactive.");
        (await db.Entitlements.AnyAsync(e => e.TenantId == "tenant-zero-pool")).Should().BeFalse();
    }

    [Fact]
    public async Task EvaluateCallAdmission_InactiveExistingEntitlement_RejectsCallEvenIfAutoProvisionIsTrue()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var options = Options.Create(new MediaMeteringOptions
        {
            AutoProvisionDefaultEntitlement = true,
            DefaultCallMinutesMonthly = 1000
        });
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance, options);

        // Pre-existing entitlement is deactivated (e.g. suspended account)
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = "tenant-suspended",
            CallMinutesMonthly = 1000,
            IsActive = false,
            AllowOverdraft = true
        });
        await db.SaveChangesAsync();

        var decision = await service.EvaluateCallAdmissionAsync("tenant-suspended");

        decision.Allowed.Should().BeFalse();
        decision.Reason.Should().Be("Tenant teleconsultation entitlement is inactive.");

        // Should not overwrite or reactivate the existing entitlement
        var entitlement = await db.Entitlements.FirstAsync(e => e.TenantId == "tenant-suspended");
        entitlement.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task EvaluateCallAdmission_PoolExhausted_ZeroMutationAssertion_OnRejection()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var yearMonth = DateTime.UtcNow.ToString("yyyy-MM");
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = "tenant-hard-cap",
            CallMinutesMonthly = 200,
            IsActive = true,
            AllowOverdraft = false
        });
        db.MonthlyUsages.Add(new TenantMonthlyUsage
        {
            TenantId = "tenant-hard-cap",
            YearMonth = yearMonth,
            MinutesUsed = 200,
            MinutesOverdraft = 0,
            TotalCallsCompleted = 10
        });
        await db.SaveChangesAsync();

        var decision = await service.EvaluateCallAdmissionAsync("tenant-hard-cap");

        decision.Allowed.Should().BeFalse();
        decision.Reason.Should().Contain("exhausted");

        // Verify state is completely unmutated
        var usage = await db.MonthlyUsages.FirstAsync(u => u.TenantId == "tenant-hard-cap");
        usage.MinutesUsed.Should().Be(200);
        usage.TotalCallsCompleted.Should().Be(10);
    }

    [Fact]
    public async Task RecordCallEnded_NonExistentSession_LogsWarningAndDoesNotMutateDbOrPublish()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var phantomCallId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        await service.RecordCallEndedAsync(phantomCallId, now.AddMinutes(-10), now);

        publisher.VerifyNoOtherCalls();
        (await db.MonthlyUsages.AnyAsync()).Should().BeFalse();
        (await db.AuditLogs.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task RecordCallEnded_ZeroSecondDuration_RoundsUpToOneMinuteMinimumBilling()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var callId = Guid.NewGuid();
        var tenantId = "tenant-quick-call";
        var now = DateTime.UtcNow;

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 100,
            IsActive = true,
            AllowOverdraft = false
        });
        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-1",
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = now,
            StartedAtUtc = now
        });
        await db.SaveChangesAsync();

        // Zero second call (instant disconnect)
        await service.RecordCallEndedAsync(callId, now, now);

        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.DurationMinutes.Should().Be(1, "telecom billing standard mandates 1 minute minimum charge");
        session.BillableMinutes.Should().Be(1);
    }
}
