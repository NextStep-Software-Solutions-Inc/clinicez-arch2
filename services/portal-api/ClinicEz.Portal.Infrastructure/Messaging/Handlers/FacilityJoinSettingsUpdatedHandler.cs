using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>facility.join-settings.updated</c> (<c>InteropTypes.FacilityJoinSettingsUpdated</c>).
/// Updates or upserts public join link settings, join codes, operating hours, and address on the Facility projection.
/// Enforces strict sender facility validation and monotonic timestamp ordering.
/// </summary>
public sealed class FacilityJoinSettingsUpdatedHandler(
    IApplicationDbContext dbContext,
    ILogger<FacilityJoinSettingsUpdatedHandler> logger) : IInteropHandler<FacilityJoinSettingsUpdatedPayload>
{
    public async Task HandleAsync(FacilityJoinSettingsUpdatedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        var sender = context.From;
        if (sender.Kind != PartyKind.Facility
            || !Guid.TryParse(sender.TenantId, out var senderTenantId)
            || !Guid.TryParse(sender.FacilityId, out var senderFacilityId)
            || !Guid.TryParse(payload.TenantId, out var payloadTenantId)
            || senderTenantId != payloadTenantId
            || senderFacilityId != payload.FacilityId)
        {
            logger.LogWarning("Ignoring facility.join-settings.updated from {Sender}: sender does not match facility {FacilityId} / tenant {TenantId}.",
                sender.Address, payload.FacilityId, payload.TenantId);
            return;
        }

        var facility = await dbContext.Facilities
            .FirstOrDefaultAsync(f => f.Id == payload.FacilityId && f.TenantId == payloadTenantId, ct);

        if (facility != null && facility.JoinSettingsUpdatedAtUtc.HasValue && payload.UpdatedAtUtc < facility.JoinSettingsUpdatedAtUtc.Value)
        {
            logger.LogInformation("Ignoring stale facility.join-settings.updated for facility {FacilityId} (incoming {PayloadUtc} < existing {CurrentUtc}).",
                payload.FacilityId, payload.UpdatedAtUtc, facility.JoinSettingsUpdatedAtUtc.Value);
            return;
        }

        var normalizedCode = string.IsNullOrWhiteSpace(payload.JoinCode)
            ? null
            : payload.JoinCode.Trim().ToUpperInvariant();

        if (facility is null)
        {
            var tenant = await dbContext.Tenants.FirstOrDefaultAsync(t => t.Id == payloadTenantId, ct);
            if (tenant is null)
            {
                logger.LogWarning("Cannot upsert facility {FacilityId}: tenant {TenantId} not found.", payload.FacilityId, payloadTenantId);
                return;
            }

            facility = new Facility
            {
                Id = payload.FacilityId,
                TenantId = payloadTenantId,
                Name = "Clinic Facility",
                Slug = $"clinic-{payload.FacilityId:N}"[..16],
                FacilityType = FacilityType.Clinic,
                Status = FacilityStatus.Active,
                DeploymentMode = FacilityDeploymentMode.SharedCloud,
                Visibility = FacilityVisibility.Public,
                IsJoinEnabled = payload.IsJoinEnabled,
                JoinCode = normalizedCode,
                JoinCodeExpiresAtUtc = payload.JoinCodeExpiresAtUtc,
                JoinSettingsUpdatedAtUtc = payload.UpdatedAtUtc,
                StreetAddress = payload.FacilityAddress,
                OperatingHours = payload.OperatingHours
            };
            dbContext.Facilities.Add(facility);
        }
        else
        {
            facility.IsJoinEnabled = payload.IsJoinEnabled;
            facility.JoinCode = normalizedCode;
            facility.JoinCodeExpiresAtUtc = payload.JoinCodeExpiresAtUtc;
            facility.JoinSettingsUpdatedAtUtc = payload.UpdatedAtUtc;

            if (!string.IsNullOrWhiteSpace(payload.FacilityAddress))
                facility.StreetAddress = payload.FacilityAddress;

            if (!string.IsNullOrWhiteSpace(payload.OperatingHours))
                facility.OperatingHours = payload.OperatingHours;
        }

        await dbContext.SaveChangesAsync(ct);
        logger.LogInformation("Successfully updated join settings for facility {FacilityId} (JoinCode={JoinCode}, Enabled={Enabled}).",
            facility.Id, facility.JoinCode, facility.IsJoinEnabled);
    }
}
