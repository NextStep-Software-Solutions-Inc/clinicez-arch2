using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>facility.queue-board.updated</c> (<c>InteropTypes.QueueBoardUpdated</c>).
/// Upserts zero-PHI waiting-area TV queue snapshots keyed by (TenantId, FacilityId).
/// Populates Manila QueueDate, NowServingJson, UpNextJson, and EmergencyJson.
/// </summary>
public sealed class QueueBoardUpdatedHandler(
    IApplicationDbContext dbContext,
    ILogger<QueueBoardUpdatedHandler> logger) : IInteropHandler<QueueBoardUpdatedPayload>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public async Task HandleAsync(QueueBoardUpdatedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        var sender = context.From;
        if (sender.Kind != PartyKind.Facility
            || !Guid.TryParse(sender.TenantId, out var senderTenantId)
            || !Guid.TryParse(sender.FacilityId, out var senderFacilityId)
            || !Guid.TryParse(payload.TenantId, out var payloadTenantId)
            || senderTenantId != payloadTenantId
            || senderFacilityId != payload.FacilityId)
        {
            logger.LogWarning("Ignoring facility.queue-board.updated from {Sender}: sender does not match facility {FacilityId} / tenant {TenantId}.",
                sender.Address, payload.FacilityId, payload.TenantId);
            return;
        }

        var existing = await dbContext.FacilityQueueBoards
            .FirstOrDefaultAsync(q => q.TenantId == payloadTenantId && q.FacilityId == payload.FacilityId, ct);

        if (existing != null && payload.GeneratedAtUtc < existing.GeneratedAtUtc)
        {
            logger.LogInformation("Ignoring stale facility.queue-board.updated for facility {FacilityId} (incoming {PayloadUtc} < existing {CurrentUtc}).",
                payload.FacilityId, payload.GeneratedAtUtc, existing.GeneratedAtUtc);
            return;
        }

        var nowServingJson = JsonSerializer.Serialize(payload.NowServing, JsonOptions);
        var upNextJson = JsonSerializer.Serialize(payload.UpNext, JsonOptions);
        var emergencyList = payload.UpNext
            .Where(t => string.Equals(t.Priority, "Emergency", StringComparison.OrdinalIgnoreCase))
            .ToList();
        var emergencyJson = JsonSerializer.Serialize(emergencyList, JsonOptions);

        if (existing is null)
        {
            var queueBoard = new FacilityQueueBoard
            {
                TenantId = payloadTenantId,
                FacilityId = payload.FacilityId,
                QueueDate = payload.QueueDate,
                IsAcceptingWalkIns = payload.IsAcceptingWalkIns,
                PatientsWaitingCount = payload.PatientsWaitingCount,
                TvDisplayPin = payload.TvDisplayPin,
                NowServingJson = nowServingJson,
                UpNextJson = upNextJson,
                EmergencyJson = emergencyJson,
                GeneratedAtUtc = payload.GeneratedAtUtc,
                UpdatedAtUtc = DateTime.UtcNow
            };
            dbContext.FacilityQueueBoards.Add(queueBoard);
        }
        else
        {
            existing.QueueDate = payload.QueueDate;
            existing.IsAcceptingWalkIns = payload.IsAcceptingWalkIns;
            existing.PatientsWaitingCount = payload.PatientsWaitingCount;
            existing.TvDisplayPin = payload.TvDisplayPin;
            existing.NowServingJson = nowServingJson;
            existing.UpNextJson = upNextJson;
            existing.EmergencyJson = emergencyJson;
            existing.GeneratedAtUtc = payload.GeneratedAtUtc;
            existing.UpdatedAtUtc = DateTime.UtcNow;
        }

        await dbContext.SaveChangesAsync(ct);
        logger.LogInformation("Successfully ingested FacilityQueueBoard for Facility {FacilityId} (Date={Date}, Waiting={Count}).",
            payload.FacilityId, payload.QueueDate, payload.PatientsWaitingCount);
    }
}
