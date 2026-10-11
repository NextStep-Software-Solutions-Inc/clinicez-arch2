using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Licensing;

public class EntitlementRenewalJobTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero));
    private readonly Mock<IEntitlementsPublisher> _publisher = new();
    private readonly Mock<IHubOnboardingService> _hub = new();
    private readonly LicenseOptions _license = new() { GraceDays = 14, RenewBeforeDays = 10 };

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private DateTime Now => _clock.GetUtcNow().UtcDateTime;

    private EntitlementRenewalJob Job() =>
        new(_context, _publisher.Object, _hub.Object, Options.Create(_license), _clock, NullLogger<EntitlementRenewalJob>.Instance);

    private async Task<Tenant> AddTenantAsync(string slug)
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = slug, Name = slug, OwnerId = $"o-{slug}", Email = $"{slug}@ws.ph" };
        _context.Tenants.Add(tenant);
        await _context.SaveChangesAsync();
        return tenant;
    }

    private async Task AddFacilityAsync(Tenant tenant, DateTime? licenseExpiresAt, FacilityStatus status = FacilityStatus.Active)
    {
        _context.Facilities.Add(new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Name = "Site",
            FacilityType = FacilityType.Clinic,
            Status = status,
            LicenseExpiresAt = licenseExpiresAt
        });
        await _context.SaveChangesAsync();
    }

    private async Task AddHubClientAsync(Tenant tenant)
    {
        _context.EdgeHubClients.Add(new EdgeHubClient { TenantId = tenant.Id, CellId = $"edge-{tenant.Id}", Service = "cell", ClientId = $"client-{tenant.TenantSlug}" });
        await _context.SaveChangesAsync();
    }

    private Task SubscribeAsync(Tenant tenant, SubscriptionStatus status, DateTime? periodEnd = null, DateTime? trialEndsAt = null) =>
        TestSupport.SeedSubscriptionAsync(_context, tenant.Id, status, "pro", periodEnd, trialEndsAt);

    [Fact]
    public async Task Renew_RefreshesWorkspacesWhoseLicensesExpireSoonOrWereNeverIssued()
    {
        var soon = await AddTenantAsync("soon");
        var never = await AddTenantAsync("never");
        var fresh = await AddTenantAsync("fresh");
        var inactive = await AddTenantAsync("inactive");
        await AddFacilityAsync(soon, Now.AddDays(9));
        await AddFacilityAsync(never, null);
        await AddFacilityAsync(fresh, Now.AddDays(25));
        await AddFacilityAsync(inactive, Now.AddDays(1), FacilityStatus.Suspended);

        var renewed = await Job().RenewExpiringAsync(CancellationToken.None);

        Assert.Equal(2, renewed);
        _publisher.Verify(p => p.StageForWorkspaceAsync(soon.Id, It.IsAny<CancellationToken>()), Times.Once);
        _publisher.Verify(p => p.StageForWorkspaceAsync(never.Id, It.IsAny<CancellationToken>()), Times.Once);
        _publisher.Verify(p => p.StageForWorkspaceAsync(fresh.Id, It.IsAny<CancellationToken>()), Times.Never);
        _publisher.Verify(p => p.StageForWorkspaceAsync(inactive.Id, It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Renew_OnceForAWorkspaceWithSeveralExpiringFacilities_AndOneFailureDoesNotStopTheOthers()
    {
        var broken = await AddTenantAsync("broken");
        var healthy = await AddTenantAsync("healthy");
        await AddFacilityAsync(broken, Now.AddDays(1));
        await AddFacilityAsync(broken, Now.AddDays(2));
        await AddFacilityAsync(healthy, Now.AddDays(1));
        _publisher.Setup(p => p.StageForWorkspaceAsync(broken.Id, It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException("boom"));

        await Job().RenewExpiringAsync(CancellationToken.None);

        _publisher.Verify(p => p.StageForWorkspaceAsync(broken.Id, It.IsAny<CancellationToken>()), Times.Once);
        _publisher.Verify(p => p.StageForWorkspaceAsync(healthy.Id, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RevokeLapsed_RevokesWorkspacesWhoseSubscriptionEndedBeyondTheGracePeriod()
    {
        var lapsedTrial = await AddTenantAsync("lapsed-trial");
        var lapsedPaid = await AddTenantAsync("lapsed-paid");
        var cancelled = await AddTenantAsync("cancelled");
        foreach (var tenant in new[] { lapsedTrial, lapsedPaid, cancelled }) await AddHubClientAsync(tenant);
        await SubscribeAsync(lapsedTrial, SubscriptionStatus.Trialing, trialEndsAt: Now.AddDays(-20));
        await SubscribeAsync(lapsedPaid, SubscriptionStatus.Active, periodEnd: Now.AddDays(-20));
        await SubscribeAsync(cancelled, SubscriptionStatus.Cancelled, periodEnd: Now.AddDays(-30));

        var revoked = await Job().RevokeLapsedHubClientsAsync(CancellationToken.None);

        Assert.Equal(3, revoked);
        foreach (var tenant in new[] { lapsedTrial, lapsedPaid, cancelled })
        {
            _hub.Verify(h => h.RevokeWorkspaceAsync(tenant.Id, It.IsAny<CancellationToken>()), Times.Once);
        }
    }

    [Fact]
    public async Task RevokeLapsed_KeepsWorkspacesThatAreStillInGraceOrPaidUp()
    {
        var inGrace = await AddTenantAsync("in-grace");
        var active = await AddTenantAsync("active");
        var trialing = await AddTenantAsync("trialing");
        var pastDue = await AddTenantAsync("past-due");
        foreach (var tenant in new[] { inGrace, active, trialing, pastDue }) await AddHubClientAsync(tenant);
        await SubscribeAsync(inGrace, SubscriptionStatus.Trialing, trialEndsAt: Now.AddDays(-5));
        await SubscribeAsync(active, SubscriptionStatus.Active, periodEnd: Now.AddDays(10));
        await SubscribeAsync(trialing, SubscriptionStatus.Trialing, trialEndsAt: Now.AddDays(3));
        await SubscribeAsync(pastDue, SubscriptionStatus.Active, periodEnd: Now.AddDays(-1));

        var revoked = await Job().RevokeLapsedHubClientsAsync(CancellationToken.None);

        Assert.Equal(0, revoked);
        _hub.Verify(h => h.RevokeWorkspaceAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RevokeLapsed_IgnoresLapsedWorkspacesThatHoldNoHubClients()
    {
        var cloudOnly = await AddTenantAsync("cloud-only");
        await SubscribeAsync(cloudOnly, SubscriptionStatus.Active, periodEnd: Now.AddDays(-60));

        var revoked = await Job().RevokeLapsedHubClientsAsync(CancellationToken.None);

        Assert.Equal(0, revoked);
        _hub.Verify(h => h.RevokeWorkspaceAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RevokeLapsed_OneFailingWorkspaceDoesNotStopTheRest()
    {
        var first = await AddTenantAsync("first");
        var second = await AddTenantAsync("second");
        foreach (var tenant in new[] { first, second })
        {
            await AddHubClientAsync(tenant);
            await SubscribeAsync(tenant, SubscriptionStatus.Active, periodEnd: Now.AddDays(-40));
        }

        _hub.Setup(h => h.RevokeWorkspaceAsync(first.Id, It.IsAny<CancellationToken>())).ThrowsAsync(new HttpRequestException("hub down"));

        await Job().RevokeLapsedHubClientsAsync(CancellationToken.None);

        _hub.Verify(h => h.RevokeWorkspaceAsync(second.Id, It.IsAny<CancellationToken>()), Times.Once);
    }
}
