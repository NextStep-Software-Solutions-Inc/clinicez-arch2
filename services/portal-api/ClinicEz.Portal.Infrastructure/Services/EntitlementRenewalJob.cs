using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Infrastructure.Services;

public interface IEntitlementRenewalJob
{
    /// <summary>Re-mints and re-sends the license of every workspace that has a facility whose license expires soon.</summary>
    Task<int> RenewExpiringAsync(CancellationToken cancellationToken);

    /// <summary>Revokes the on-premise hub clients of every workspace whose subscription lapsed longer ago than the read-only grace period.</summary>
    Task<int> RevokeLapsedHubClientsAsync(CancellationToken cancellationToken);
}

public sealed class EntitlementRenewalJob(
    IApplicationDbContext context,
    IEntitlementsPublisher publisher,
    IHubOnboardingService hubOnboarding,
    IOptions<LicenseOptions> options,
    TimeProvider timeProvider,
    ILogger<EntitlementRenewalJob> logger) : IEntitlementRenewalJob
{
    public async Task<int> RenewExpiringAsync(CancellationToken cancellationToken)
    {
        var horizon = timeProvider.GetUtcNow().UtcDateTime.AddDays(options.Value.RenewBeforeDays);

        var tenantIds = await context.Facilities
            .AsNoTracking()
            .Where(f => f.Status == FacilityStatus.Active && (f.LicenseExpiresAt == null || f.LicenseExpiresAt < horizon))
            .Select(f => f.TenantId)
            .Distinct()
            .ToListAsync(cancellationToken);

        foreach (var tenantId in tenantIds)
        {
            try
            {
                await publisher.StageForWorkspaceAsync(tenantId, cancellationToken);
                await context.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "License renewal failed for workspace {TenantId}", tenantId);
            }
        }

        return tenantIds.Count;
    }

    public async Task<int> RevokeLapsedHubClientsAsync(CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var tenantIds = await context.EdgeHubClients
            .AsNoTracking()
            .Select(c => c.TenantId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var subscriptions = await context.Subscriptions
            .AsNoTracking()
            .Where(s => tenantIds.Contains(s.TenantId))
            .ToListAsync(cancellationToken);

        var lapsed = subscriptions
            .Where(s => s.EffectiveStatus(now) == SubscriptionStatus.Expired
                        && s.EntitlementsEndAt is { } end
                        && end.AddDays(options.Value.GraceDays) < now)
            .Select(s => s.TenantId)
            .ToList();

        foreach (var tenantId in lapsed)
        {
            try
            {
                await hubOnboarding.RevokeWorkspaceAsync(tenantId, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Hub client revocation failed for workspace {TenantId}", tenantId);
            }
        }

        return lapsed.Count;
    }
}
