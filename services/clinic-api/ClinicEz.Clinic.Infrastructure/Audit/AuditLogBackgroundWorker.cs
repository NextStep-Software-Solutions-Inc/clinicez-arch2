namespace ClinicEz.Clinic.Infrastructure.Audit;

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

public sealed class AuditLogBackgroundWorker : BackgroundService
{
    public const int BatchSize = 50;
    public static readonly TimeSpan BatchFlushTimeout = TimeSpan.FromMilliseconds(500);

    private readonly IAuditLogQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AuditLogBackgroundWorker> _logger;

    public AuditLogBackgroundWorker(
        IAuditLogQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<AuditLogBackgroundWorker> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AuditLogBackgroundWorker started. Bounded capacity: {Capacity}", _queue.Capacity);

        var batch = new List<AuditLogMessage>(BatchSize);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    if (await _queue.WaitToReadAsync(stoppingToken))
                    {
                        var stopwatch = Stopwatch.StartNew();

                        while (batch.Count < BatchSize && stopwatch.Elapsed < BatchFlushTimeout)
                        {
                            if (_queue.TryDequeue(out var message))
                            {
                                batch.Add(message);
                            }
                            else
                            {
                                break;
                            }
                        }

                        if (batch.Count > 0)
                        {
                            var persisted = await ProcessBatchAsync(batch, CancellationToken.None);
                            if (persisted)
                            {
                                batch.Clear();
                            }
                        }
                    }
                    else
                    {
                        break;
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error in audit log ingestion loop; applying 1s backoff.");
                    try
                    {
                        await Task.Delay(1000, stoppingToken);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Expected during host shutdown
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fatal error in audit log worker loop; proceeding to graceful drain.");
        }
        finally
        {
            try
            {
                await DrainRemainingAsync(batch);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error during audit log shutdown drain.");
            }

            _logger.LogInformation("AuditLogBackgroundWorker completed shutdown gracefully.");
        }
    }

    public async Task<bool> ProcessBatchAsync(IReadOnlyList<AuditLogMessage> messages, CancellationToken cancellationToken = default)
    {
        if (messages == null || messages.Count == 0) return true;

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var redactionService = scope.ServiceProvider.GetRequiredService<IPhiRedactionService>();

            var entities = new List<ClinicAuditEntry>(messages.Count);

            foreach (var msg in messages)
            {
                var sanitizedMetadata = redactionService.RedactPayloadJson(msg.MetadataJson ?? "{}");
                var maskedName = !string.IsNullOrWhiteSpace(msg.PatientName)
                    ? redactionService.MaskPatientName(msg.PatientName)
                    : msg.PatientNameMasked;
                var maskedPin = !string.IsNullOrWhiteSpace(msg.PatientPin)
                    ? redactionService.MaskPhilHealthPin(msg.PatientPin)
                    : msg.PatientPinMasked;

                var entry = new ClinicAuditEntry
                {
                    Id = msg.Id != Guid.Empty ? msg.Id : Guid.NewGuid(),
                    TenantId = msg.TenantId,
                    ClinicId = msg.ClinicId,
                    Timestamp = msg.Timestamp != default ? msg.Timestamp : DateTime.UtcNow,
                    Category = msg.Category,
                    Severity = msg.Severity,
                    Action = msg.Action,
                    ActorStaffId = msg.ActorStaffId,
                    ActorName = msg.ActorName,
                    ActorRole = msg.ActorRole,
                    ClientIpAddress = msg.ClientIpAddress,
                    UserAgent = msg.UserAgent,
                    TargetEntityType = msg.TargetEntityType,
                    TargetEntityId = msg.TargetEntityId,
                    PatientId = msg.PatientId,
                    PatientNameMasked = maskedName,
                    PatientPinMasked = maskedPin,
                    Outcome = msg.Outcome,
                    Description = msg.Description,
                    MetadataJson = sanitizedMetadata
                };

                entities.Add(entry);
            }

            await dbContext.ClinicAuditEntries.AddRangeAsync(entities, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);

            _logger.LogDebug("Persisted {Count} audit log entries successfully.", entities.Count);
            return true;
        }
        catch (OperationCanceledException ex)
        {
            _logger.LogWarning("Audit log batch persistence cancelled ({Count} entries). Message: {Message}", messages.Count, ex.Message);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist batch of {Count} audit log entries to database.", messages.Count);
            return false;
        }
    }

    private async Task DrainRemainingAsync(List<AuditLogMessage>? pendingBatch = null)
    {
        _logger.LogInformation("Draining remaining audit log messages before worker termination...");

        try
        {
            if (pendingBatch != null && pendingBatch.Count > 0)
            {
                _logger.LogInformation("Draining {Count} in-flight audit messages from unpersisted batch...", pendingBatch.Count);
                var persisted = await ProcessBatchAsync(pendingBatch, CancellationToken.None);
                if (persisted)
                {
                    pendingBatch.Clear();
                }
                else
                {
                    _logger.LogCritical("Failed to persist pending batch of {Count} audit messages during shutdown drain.", pendingBatch.Count);
                }
            }

            var drainBatch = new List<AuditLogMessage>(BatchSize);

            while (_queue.TryDequeue(out var message))
            {
                drainBatch.Add(message);
                if (drainBatch.Count >= BatchSize)
                {
                    var persisted = await ProcessBatchAsync(drainBatch, CancellationToken.None);
                    if (persisted)
                    {
                        drainBatch.Clear();
                    }
                    else
                    {
                        _logger.LogCritical("Failed to persist drain batch of {Count} audit messages.", drainBatch.Count);
                        drainBatch.Clear();
                    }
                }
            }

            if (drainBatch.Count > 0)
            {
                var persisted = await ProcessBatchAsync(drainBatch, CancellationToken.None);
                if (persisted)
                {
                    drainBatch.Clear();
                }
                else
                {
                    _logger.LogCritical("Failed to persist final drain batch of {Count} audit messages.", drainBatch.Count);
                    drainBatch.Clear();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogCritical(ex, "Fatal error occurred while draining audit log queue during shutdown.");
        }
    }
}
