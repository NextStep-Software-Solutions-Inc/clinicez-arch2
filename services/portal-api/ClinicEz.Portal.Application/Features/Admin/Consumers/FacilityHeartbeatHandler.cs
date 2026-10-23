using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Admin.Consumers;

/// <summary>
/// Records that a facility is alive (<c>facility.heartbeat</c>): last seen time and app version. The facility is identified
/// by the envelope sender only; a heartbeat from anyone else is dropped. Also detects workspace eligibility drift and
/// triggers self-healing directory updates.
/// </summary>
public sealed class FacilityHeartbeatHandler(
    IApplicationDbContext dbContext,
    TimeProvider timeProvider,
    IFacilityProvisioningPublisher provisioningPublisher,
    ILogger<FacilityHeartbeatHandler> logger) : IInteropHandler<FacilityHeartbeatPayload>
{
    private const int MaxVersionLength = 64;

    public async Task HandleAsync(FacilityHeartbeatPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        var sender = context.From;
        if (sender.Kind != PartyKind.Facility
            || !Guid.TryParse(sender.TenantId, out var tenantId)
            || !Guid.TryParse(sender.FacilityId, out var facilityId))
        {
            logger.LogWarning("Ignoring facility.heartbeat from {Sender}: the sender is not a facility.", sender.Address);
            return;
        }

        var facility = await dbContext.Facilities.Include(f => f.Tenant).FirstOrDefaultAsync(f => f.Id == facilityId && f.TenantId == tenantId, ct);
        if (facility is null)
        {
            logger.LogWarning("Ignoring facility.heartbeat from {Sender}: no such facility.", sender.Address);
            return;
        }

        var tenant = facility.Tenant ?? await dbContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct);

        // Drift detection: detect missing or mismatched IsWorkspaceEligible on Clinic facilities compared to portal's authoritative state
        var hasDrift = facility.FacilityType == FacilityType.Clinic && (payload.IsWorkspaceEligible.HasValue
            ? payload.IsWorkspaceEligible.Value != facility.IsPatientDiscoveryEligible
            : facility.IsPatientDiscoveryEligible);

        if (hasDrift && tenant is not null)
        {
            logger.LogWarning(
                "Facility {FacilityId} reported heartbeat eligibility drift (Heartbeat={HeartbeatEligible}, Portal={PortalEligible}). Triggering self-healing directory update.",
                facility.Id,
                payload.IsWorkspaceEligible,
                facility.IsPatientDiscoveryEligible);

            await provisioningPublisher.StageDirectoryUpdateAsync(tenant, facility, ct);
        }

        var version = payload.AppVersion.Trim();
        facility.LastSeenAt = timeProvider.GetUtcNow().UtcDateTime;
        facility.AppVersion = version.Length == 0 ? null : version[..Math.Min(version.Length, MaxVersionLength)];

        await dbContext.SaveChangesAsync(ct);
    }
}
