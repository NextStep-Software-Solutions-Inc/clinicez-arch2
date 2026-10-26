using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.Infrastructure.Messaging.Handlers;

/// <summary>
/// Ingests <c>comms.eligibility.revoked</c> events from facilities.
/// Enforces monotonic version ordering and forwards revocation sync to the patient mailbox.
/// </summary>
public sealed class CommsEligibilityRevokedHandler : IInteropHandler<CommsEligibilityRevokedPayload>
{
    private readonly CommsDbContext _db;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<CommsEligibilityRevokedHandler> _logger;

    public CommsEligibilityRevokedHandler(
        CommsDbContext db,
        IInteropPublisher publisher,
        ILogger<CommsEligibilityRevokedHandler> logger)
    {
        _db = db;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task HandleAsync(CommsEligibilityRevokedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        _logger.LogInformation(
            "[CommsEligibilityRevokedHandler] Revoking grant {GrantId} for Patient {PatientId} ({TenantId}/{FacilityId}, Reason: {Reason}, Version: {Version})",
            message.GrantId, message.PatientId, message.TenantId, message.FacilityId, message.Reason, message.Version);

        var existing = await _db.EligibilityGrants
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(g => g.Id == message.GrantId, ct);

        if (existing != null)
        {
            if (existing.Version >= message.Version)
            {
                _logger.LogInformation(
                    "[CommsEligibilityRevokedHandler] Dropping stale revocation for grant {GrantId} (Current: {CurrentVersion}, Inbound: {InboundVersion})",
                    message.GrantId, existing.Version, message.Version);
                return;
            }

            existing.IsActive = false;
            existing.RevokedAtUtc = message.RevokedAtUtc;
            existing.RevokeReason = message.Reason;
            existing.Version = message.Version;
        }
        else
        {
            // Tombstone entry to ensure out-of-order previous grants do not resurrect
            var grant = new EligibilityGrant
            {
                Id = message.GrantId,
                TenantId = message.TenantId,
                FacilityId = message.FacilityId,
                FacilityType = "Clinic",
                PatientId = message.PatientId,
                ContextType = string.Empty,
                ContextId = string.Empty,
                WindowStartUtc = message.RevokedAtUtc,
                WindowEndUtc = message.RevokedAtUtc,
                IsActive = false,
                RevokedAtUtc = message.RevokedAtUtc,
                RevokeReason = message.Reason,
                Version = message.Version,
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.EligibilityGrants.Add(grant);
        }

        await _db.SaveChangesAsync(ct);

        if (message.PatientId != Guid.Empty)
        {
            var facilityType = existing?.FacilityType ?? "Clinic";
            var syncPayload = new CommsEligibilitySyncedPayload(
                GrantId: message.GrantId,
                TenantId: message.TenantId,
                FacilityId: message.FacilityId,
                FacilityType: facilityType,
                PatientId: message.PatientId,
                ContextType: existing?.ContextType ?? string.Empty,
                ContextId: existing?.ContextId ?? string.Empty,
                IsActive: false,
                WindowEndUtc: existing?.WindowEndUtc,
                Version: message.Version);

            if (!Enum.TryParse<FacilityType>(facilityType, ignoreCase: true, out var fType))
            {
                fType = FacilityType.Clinic;
            }

            var from = Party.ForFacility(message.TenantId, message.FacilityId, fType, service: InteropServices.Comms);
            var to = Party.ForPatient(message.PatientId.ToString());

            _publisher.Enqueue(
                InteropTypes.CommsEligibilitySynced,
                from,
                to,
                correlationId: message.GrantId,
                syncPayload);

            await _db.SaveChangesAsync(ct);
        }
    }
}
