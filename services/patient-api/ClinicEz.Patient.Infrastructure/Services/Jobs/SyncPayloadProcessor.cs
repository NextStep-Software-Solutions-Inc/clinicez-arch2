using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs;

public sealed class SyncPayloadProcessor : ISyncPayloadProcessor
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISyncNotificationService _notificationService;
    private readonly IEnumerable<ISyncEntityProcessor> _processors;
    private readonly ILogger<SyncPayloadProcessor> _logger;

    public SyncPayloadProcessor(
        IUnitOfWork unitOfWork,
        ISyncNotificationService notificationService,
        IEnumerable<ISyncEntityProcessor> processors,
        ILogger<SyncPayloadProcessor> logger)
    {
        _unitOfWork = unitOfWork;
        _notificationService = notificationService;
        _processors = processors;
        _logger = logger;
    }

    public async Task<PushSyncResultDto> ProcessBatchAsync(
        Guid patientId,
        IReadOnlyList<SyncLog> logs,
        int alreadyProcessedCount,
        CancellationToken cancellationToken)
    {
        var processorMap = _processors.ToDictionary(p => p.EntityType, StringComparer.Ordinal);
        var itemResults = new List<SyncItemResultDto>(logs.Count);

        int applied = 0, conflicts = 0, rejected = 0;

        foreach (var log in logs)
        {
            Guid? clientId = ExtractClientId(log.PayloadJson);

            if (!processorMap.TryGetValue(log.EntityType, out var processor))
            {
                log.Status = SyncStatus.Rejected;
                log.ConflictDetail = $"No processor registered for entity type '{log.EntityType}'.";
                rejected++;
                _logger.LogWarning("No sync processor for {EntityType}.", log.EntityType);

                itemResults.Add(new SyncItemResultDto(
                    log.IdempotencyKey,
                    log.EntityType,
                    log.Operation.ToString(),
                    clientId,
                    log.EntityId,
                    SyncStatus.Rejected.ToString(),
                    log.ConflictDetail));
                continue;
            }

            try
            {
                var result = await processor.ProcessAsync(log, cancellationToken);

                log.Status = result switch
                {
                    { Applied: true }    => SyncStatus.Applied,
                    { IsConflict: true } => SyncStatus.ConflictResolved,
                    _                    => SyncStatus.Rejected,
                };
                log.ConflictDetail = result.ConflictDetail;

                if (result.Applied) applied++;
                else if (result.IsConflict) conflicts++;
                else rejected++;

                itemResults.Add(new SyncItemResultDto(
                    log.IdempotencyKey,
                    log.EntityType,
                    log.Operation.ToString(),
                    clientId,
                    log.EntityId,
                    log.Status.ToString(),
                    log.ConflictDetail));
            }
            catch (Exception ex)
            {
                log.Status = SyncStatus.Rejected;
                log.ConflictDetail = ex.Message;
                rejected++;
                _logger.LogError(ex,
                    "Sync processor for {EntityType} IdempotencyKey {IdempotencyKey} threw an exception.",
                    log.EntityType, log.IdempotencyKey);

                itemResults.Add(new SyncItemResultDto(
                    log.IdempotencyKey,
                    log.EntityType,
                    log.Operation.ToString(),
                    clientId,
                    log.EntityId,
                    SyncStatus.Rejected.ToString(),
                    ex.Message));
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Sync batch complete for patient {PatientId}: {Applied} applied, {Conflicts} conflicts, {Rejected} rejected.",
            patientId, applied, conflicts, rejected);

        if (applied > 0 || conflicts > 0)
        {
            await _notificationService.NotifySyncCompletedAsync(patientId, applied, conflicts, cancellationToken);
        }

        return new PushSyncResultDto(
            Accepted: logs.Count,
            Applied: applied,
            Conflicts: conflicts,
            Rejected: rejected,
            AlreadyProcessed: alreadyProcessedCount,
            AcknowledgedAt: DateTime.UtcNow,
            Items: itemResults.AsReadOnly());
    }

    private static Guid? ExtractClientId(string? payloadJson)
    {
        if (string.IsNullOrWhiteSpace(payloadJson)) return null;
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            if (doc.RootElement.TryGetProperty("clientId", out var cProp) &&
                Guid.TryParse(cProp.GetString(), out var parsedClient))
            {
                return parsedClient;
            }
            if (doc.RootElement.TryGetProperty("id", out var idProp) &&
                Guid.TryParse(idProp.GetString(), out var parsedId))
            {
                return parsedId;
            }
        }
        catch { }
        return null;
    }
}
