using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Application.Features.Licensing;

/// <summary>
/// Re-derives the signed license of every routable facility of a workspace from its current entitlements and pool shares and
/// stages <c>entitlements.changed</c> for each. Staging only: the caller (or the renewal job) saves, so the stored license and the
/// outgoing message commit together.
/// </summary>
public interface IEntitlementsPublisher
{
    Task StageForWorkspaceAsync(Guid tenantId, CancellationToken cancellationToken);
}

public sealed class EntitlementsPublisher(
    IApplicationDbContext context,
    Entitlements.IEntitlementService entitlements,
    IFacilityAllocationService allocations,
    ILicenseIssuer issuer,
    IInteropPublisher publisher) : IEntitlementsPublisher
{
    public async Task StageForWorkspaceAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, cancellationToken);
        if (tenant is null) return;

        var facilities = (await context.Facilities
                .Where(f => f.TenantId == tenantId)
                .ToListAsync(cancellationToken))
            .Where(FacilityCells.IsRoutable)
            .ToList();
        if (facilities.Count == 0) return;

        var snapshot = await entitlements.ResolveAsync(tenantId, cancellationToken);
        var shares = await allocations.ComputeSharesAsync(tenantId, snapshot, null, cancellationToken);

        foreach (var facility in facilities)
        {
            var share = shares[facility.Id];
            var license = issuer.Issue(tenant, facility, snapshot, share);
            var payload = license.Payload;

            facility.LicenseToken = license.Token;
            facility.LicenseExpiresAt = payload.ExpiresAtUtc;
            facility.PlanTier = snapshot.PlanSlug;
            facility.MaxStaffLimit = share.MaxStaff;

            var changed = new EntitlementsChangedEvent
                {
                    TenantId = tenant.Id.ToString(),
                    FacilityId = facility.Id,
                    LicenseToken = license.Token,
                    EntitlementVersion = snapshot.Version,
                    WorkspaceStatus = snapshot.Status.ToString(),
                    PlanSlug = snapshot.PlanSlug,
                    MaxStaff = payload.Limits.MaxStaff,
                    MaxStorageMb = payload.Limits.MaxStorageMb,
                    ConcurrentTerminals = payload.Limits.ConcurrentTerminals,
                    MaxBeds = payload.Limits.MaxBeds,
                    MaxAnalyzers = payload.Limits.MaxAnalyzers,
                    MaxMonthlyConsultations = payload.Limits.MaxMonthlyConsultations,
                    EnabledFeatures = payload.EnabledFeatures,
                    LicenseExpiresAtUtc = payload.ExpiresAtUtc!.Value,
                    GraceDays = payload.GraceDays,
                    ReadOnlyGraceUntilUtc = payload.ReadOnlyGraceUntil!.Value
                };

            // The facility's own service, billing, and comms services of the same cell each hold the license.
            foreach (var service in new[] { null, InteropServices.Billing, InteropServices.Comms })
            {
                publisher.Enqueue(
                    InteropTypes.EntitlementsChanged,
                    Party.Portal,
                    Party.ForFacility(tenant.Id.ToString(), facility.Id.ToString(), facility.FacilityType, service),
                    facility.Id,
                    changed);
            }
        }
    }
}
