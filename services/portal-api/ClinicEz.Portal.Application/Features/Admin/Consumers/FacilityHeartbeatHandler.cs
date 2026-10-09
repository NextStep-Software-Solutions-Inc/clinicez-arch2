using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Admin.Consumers;

/// <summary>
/// Records that a facility is alive (<c>facility.heartbeat</c>): last seen time and app version. The facility is identified
/// by the envelope sender only; a heartbeat from anyone else is dropped.
/// </summary>
public sealed class FacilityHeartbeatHandler(
    IApplicationDbContext dbContext,
    TimeProvider timeProvider,
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

        var facility = await dbContext.Facilities.FirstOrDefaultAsync(f => f.Id == facilityId && f.TenantId == tenantId, ct);
        if (facility is null)
        {
            logger.LogWarning("Ignoring facility.heartbeat from {Sender}: no such facility.", sender.Address);
            return;
        }

        var version = payload.AppVersion.Trim();
        facility.LastSeenAt = timeProvider.GetUtcNow().UtcDateTime;
        facility.AppVersion = version.Length == 0 ? null : version[..Math.Min(version.Length, MaxVersionLength)];

        await dbContext.SaveChangesAsync(ct);
    }
}
