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
/// Ingests <c>comms.eligibility.granted</c> events from clinical, laboratory, or pharmacy facilities.
/// Enforces monotonic version ordering and forwards synchronization to the patient mailbox.
/// </summary>
public sealed class CommsEligibilityGrantedHandler : IInteropHandler<CommsEligibilityGrantedPayload>
{
    private readonly CommsDbContext _db;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<CommsEligibilityGrantedHandler> _logger;

    public CommsEligibilityGrantedHandler(
        CommsDbContext db,
        IInteropPublisher publisher,
        ILogger<CommsEligibilityGrantedHandler> logger)
    {
        _db = db;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task HandleAsync(CommsEligibilityGrantedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        _logger.LogInformation(
            "[CommsEligibilityGrantedHandler] Ingesting grant {GrantId} for Patient {PatientId} ({TenantId}/{FacilityId}, Context: {ContextType}:{ContextId}, Version: {Version})",
            message.GrantId, message.PatientId, message.TenantId, message.FacilityId, message.ContextType, message.ContextId, message.Version);

        var existing = await _db.EligibilityGrants
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(g => g.Id == message.GrantId, ct);

        if (existing != null)
        {
            if (existing.Version >= message.Version)
            {
                _logger.LogInformation(
                    "[CommsEligibilityGrantedHandler] Dropping stale or duplicate grant {GrantId} (Current: {CurrentVersion}, Inbound: {InboundVersion})",
                    message.GrantId, existing.Version, message.Version);
                return;
            }

            existing.TenantId = message.TenantId;
            existing.FacilityId = message.FacilityId;
            existing.FacilityType = message.FacilityType;
            existing.PatientId = message.PatientId;
            existing.ContextType = message.ContextType;
            existing.ContextId = message.ContextId;
            existing.WindowStartUtc = message.WindowStartUtc;
            existing.WindowEndUtc = message.WindowEndUtc;
            existing.IsActive = true;
            existing.RevokedAtUtc = null;
            existing.RevokeReason = null;
            existing.Version = message.Version;
        }
        else
        {
            var grant = new EligibilityGrant
            {
                Id = message.GrantId,
                TenantId = message.TenantId,
                FacilityId = message.FacilityId,
                FacilityType = message.FacilityType,
                PatientId = message.PatientId,
                ContextType = message.ContextType,
                ContextId = message.ContextId,
                WindowStartUtc = message.WindowStartUtc,
                WindowEndUtc = message.WindowEndUtc,
                IsActive = true,
                Version = message.Version,
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.EligibilityGrants.Add(grant);
        }

        await _db.SaveChangesAsync(ct);

        // Forward synchronization notification to the patient mailbox
        if (message.PatientId != Guid.Empty)
        {
            var syncPayload = new CommsEligibilitySyncedPayload(
                GrantId: message.GrantId,
                TenantId: message.TenantId,
                FacilityId: message.FacilityId,
                FacilityType: message.FacilityType,
                PatientId: message.PatientId,
                ContextType: message.ContextType,
                ContextId: message.ContextId,
                IsActive: true,
                WindowEndUtc: message.WindowEndUtc,
                Version: message.Version);

            if (!Enum.TryParse<FacilityType>(message.FacilityType, ignoreCase: true, out var fType))
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
