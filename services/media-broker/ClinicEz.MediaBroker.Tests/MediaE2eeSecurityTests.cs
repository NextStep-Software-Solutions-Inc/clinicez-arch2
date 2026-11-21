using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Api.Controllers;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.MediaBroker.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.MediaBroker.Tests;

public class MediaE2eeSecurityTests
{
    private static MediaBrokerDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    [Fact]
    public async Task AuditTransportFallback_Rejects_WhenTenantProhibitsFallback()
    {
        var db = CreateInMemoryDb();
        var controller = new MediaController(db);

        var tenantId = "tenant-strict-e2ee";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 500,
            IsActive = true,
            AllowTransportOnlyFallback = false // Strict E2EE mandatory!
        });
        await db.SaveChangesAsync();

        var act = () => controller.AuditTransportFallback(
            new MediaController.TransportFallbackAuditRequest(
                TenantId: tenantId,
                CallId: Guid.NewGuid(),
                Reason: "Legacy browser compatibility"),
            CancellationToken.None
        );

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*strictly prohibits unencrypted transport-only fallback*");
    }

    [Fact]
    public async Task AuditTransportFallback_PermitsAndLogs_WhenExplicitlyAllowed()
    {
        var db = CreateInMemoryDb();
        var controller = new MediaController(db);

        var tenantId = "tenant-legacy";
        var callId = Guid.NewGuid();
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 500,
            IsActive = true,
            AllowTransportOnlyFallback = true // Permitted for legacy
        });
        await db.SaveChangesAsync();

        var result = await controller.AuditTransportFallback(
            new MediaController.TransportFallbackAuditRequest(
                TenantId: tenantId,
                CallId: callId,
                Reason: "Hospital ward legacy desktop endpoint without WebRTC Insertable Streams"),
            CancellationToken.None
        );

        result.Should().NotBeNull();

        // Verify audit log
        var log = await db.AuditLogs.FirstOrDefaultAsync(l => l.TenantId == tenantId && l.CallId == callId);
        log.Should().NotBeNull();
        log!.EventType.Should().Be("TransportFallbackAudited");
        log.Details.Should().Contain("Hospital ward legacy");
    }
}
