using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Licensing;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Services;

public interface IFacilityProvisioningReconciliationJob
{
    Task ReconcileStuckFacilitiesAsync(CancellationToken cancellationToken = default);
}

public class FacilityProvisioningReconciliationJob(
    IApplicationDbContext dbContext,
    IPublishEndpoint publishEndpoint,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<FacilityProvisioningReconciliationJob> logger
) : IFacilityProvisioningReconciliationJob
{
    public async Task ReconcileStuckFacilitiesAsync(CancellationToken cancellationToken = default)
    {
        // Identify facilities that have been in Provisioning status for more than 2 minutes
        var threshold = DateTime.UtcNow.AddMinutes(-2);
        var stuckFacilities = await dbContext.Facilities
            .Where(f => f.Status == FacilityStatus.Provisioning && f.CreatedAt < threshold && !f.IsDeleted)
            .ToListAsync(cancellationToken);

        if (stuckFacilities.Count == 0) return;

        logger.LogWarning("[Reconciliation] Detected {Count} facility/facilities stuck in Provisioning", stuckFacilities.Count);

        foreach (var facility in stuckFacilities)
        {
            try
            {
                var tenant = await dbContext.Tenants.FirstOrDefaultAsync(t => t.Id == facility.TenantId, cancellationToken);
                if (tenant == null) continue;

                var planTier = facility.PlanTier ?? "Community";
                var limits = PlanTierDefaults.GetLimitsForTier(planTier);
                var expiresAt = facility.LicenseExpiresAt ?? DateTime.UtcNow.AddYears(1);
                var slug = !string.IsNullOrWhiteSpace(facility.Slug)
                    ? facility.Slug
                    : GetFacilitiesQueryHandler.GenerateFacilitySlug(facility.Name);
                var consoleUrl = GetFacilitiesQueryHandler.ResolveConsoleUrl(configuration, facility.FacilityType, facility.Status, facility.Id, slug, tenant.TenantSlug);

                // Re-publish provisioning event to fan out across microservices
                await publishEndpoint.Publish(new FacilityCreatedEvent
                {
                    TenantId = tenant.Id.ToString(),
                    TenantSlug = tenant.TenantSlug,
                    FacilityType = facility.FacilityType,
                    ResourceId = facility.Id,
                    Name = facility.Name,
                    Slug = slug,
                    LicenseToken = facility.LicenseToken,
                    Limits = limits,
                    PlanTier = planTier,
                    LicenseExpiresAt = expiresAt,
                    ConsoleUrl = consoleUrl
                }, cancellationToken);

                logger.LogInformation("[Reconciliation] Re-published FacilityCreatedEvent for facility '{Name}' ({Id})", facility.Name, facility.Id);

                // In Development mode, ensure facilities older than 3 minutes do not block developer workflows
                if (environment.IsDevelopment() && facility.CreatedAt < DateTime.UtcNow.AddMinutes(-3))
                {
                    facility.Status = FacilityStatus.Active;
                    facility.UpdatedAt = DateTime.UtcNow;
                    logger.LogInformation("[Reconciliation] Auto-healed facility '{Name}' ({Id}) to Active in development", facility.Name, facility.Id);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "[Reconciliation] Failed to reconcile facility {Id}", facility.Id);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
