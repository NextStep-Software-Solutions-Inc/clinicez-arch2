using System.Text.Json;
using Hangfire;
using Microsoft.Extensions.Logging;
using PatientAppBE.Application.Common.Interfaces;
using PatientAppBE.Domain.Enums;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Infrastructure.Services.Jobs;

/// <summary>
/// Hangfire job that processes queued offline-sync payloads.
/// Runs in its own DI scope (Hangfire creates one per job execution).
/// Applies Last-Write-Wins conflict resolution via per-entity processors.
/// </summary>
public sealed class SyncPayloadJobProcessor : ISyncPayloadJob
{
    private readonly ISyncLogRepository _syncLogRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISyncNotificationService _notificationService;
    private readonly IEnumerable<ISyncEntityProcessor> _processors;
    private readonly ILogger<SyncPayloadJobProcessor> _logger;

    public SyncPayloadJobProcessor(
        ISyncLogRepository syncLogRepository,
        IUnitOfWork unitOfWork,
        ISyncNotificationService notificationService,
        IEnumerable<ISyncEntityProcessor> processors,
        ILogger<SyncPayloadJobProcessor> logger)
    {
        _syncLogRepository = syncLogRepository;
        _unitOfWork = unitOfWork;
        _notificationService = notificationService;
        _processors = processors;
        _logger = logger;
    }

    [AutomaticRetry(Attempts = 3, OnAttemptsExceeded = AttemptsExceededAction.Delete)]
    public async Task ProcessAsync(Guid patientId, string idempotencyKeysJson, CancellationToken cancellationToken)
    {
        var idempotencyKeys = JsonSerializer.Deserialize<List<Guid>>(idempotencyKeysJson)
            ?? throw new ArgumentException("idempotencyKeysJson could not be deserialized.", nameof(idempotencyKeysJson));

        var pendingLogs = await _syncLogRepository.GetPendingByIdempotencyKeysAsync(idempotencyKeys, cancellationToken);

        if (pendingLogs.Count == 0)
        {
            _logger.LogDebug("Sync job for patient {PatientId}: no pending items found.", patientId);
            return;
        }

        int applied = 0, conflicts = 0, rejected = 0;

        var processorMap = _processors.ToDictionary(p => p.EntityType, StringComparer.Ordinal);

        foreach (var log in pendingLogs)
        {
            if (!processorMap.TryGetValue(log.EntityType, out var processor))
            {
                log.Status = SyncStatus.Rejected;
                log.ConflictDetail = $"No processor registered for entity type '{log.EntityType}'.";
                rejected++;
                _logger.LogWarning("No sync processor for {EntityType}.", log.EntityType);
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
            }
            catch (Exception ex)
            {
                log.Status = SyncStatus.Rejected;
                log.ConflictDetail = ex.Message;
                rejected++;
                _logger.LogError(ex,
                    "Sync processor for {EntityType} IdempotencyKey {IdempotencyKey} threw an exception.",
                    log.EntityType, log.IdempotencyKey);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Sync job complete — patient {PatientId}: {Applied} applied, {Conflicts} conflicts, {Rejected} rejected out of {Total}.",
            patientId, applied, conflicts, rejected, pendingLogs.Count);

        await _notificationService.NotifySyncCompletedAsync(patientId, applied, conflicts, cancellationToken);
    }
}
