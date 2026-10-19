using System.Text.Json;
using Hangfire;
using Microsoft.Extensions.Logging;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs;

/// <summary>
/// Hangfire job that processes queued offline-sync payloads.
/// Runs in its own DI scope (Hangfire creates one per job execution).
/// Applies Last-Write-Wins conflict resolution via per-entity processors.
/// </summary>
public sealed class SyncPayloadJobProcessor : ISyncPayloadJob
{
    private readonly ISyncLogRepository _syncLogRepository;
    private readonly ISyncPayloadProcessor _syncPayloadProcessor;
    private readonly ILogger<SyncPayloadJobProcessor> _logger;

    public SyncPayloadJobProcessor(
        ISyncLogRepository syncLogRepository,
        ISyncPayloadProcessor syncPayloadProcessor,
        ILogger<SyncPayloadJobProcessor> logger)
    {
        _syncLogRepository = syncLogRepository;
        _syncPayloadProcessor = syncPayloadProcessor;
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

        await _syncPayloadProcessor.ProcessBatchAsync(patientId, pendingLogs, 0, cancellationToken);
    }
}
