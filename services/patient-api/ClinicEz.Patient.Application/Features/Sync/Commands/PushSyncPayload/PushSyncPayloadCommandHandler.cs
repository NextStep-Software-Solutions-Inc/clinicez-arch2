using System.Text.Json;
using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Sync.Commands.PushSyncPayload;

public sealed class PushSyncPayloadCommandHandler : IRequestHandler<PushSyncPayloadCommand, PushSyncResultDto>
{
    private readonly IPatientRepository _patientRepository;
    private readonly ISyncLogRepository _syncLogRepository;
    private readonly IBackgroundJobEnqueuer _jobEnqueuer;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISyncPayloadProcessor? _syncPayloadProcessor;

    public PushSyncPayloadCommandHandler(
        IPatientRepository patientRepository,
        ISyncLogRepository syncLogRepository,
        IBackgroundJobEnqueuer jobEnqueuer,
        IUnitOfWork unitOfWork,
        ISyncPayloadProcessor? syncPayloadProcessor = null)
    {
        _patientRepository = patientRepository;
        _syncLogRepository = syncLogRepository;
        _jobEnqueuer = jobEnqueuer;
        _unitOfWork = unitOfWork;
        _syncPayloadProcessor = syncPayloadProcessor;
    }

    public async Task<PushSyncResultDto> Handle(PushSyncPayloadCommand request, CancellationToken cancellationToken)
    {
        // Verify patient exists
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        // Idempotency: skip items already received
        var keys = request.Items.Select(i => i.IdempotencyKey);
        var existing = await _syncLogRepository.GetExistingIdempotencyKeysAsync(keys, cancellationToken);

        var newItems = request.Items
            .Where(i => !existing.Contains(i.IdempotencyKey))
            .ToList();

        var alreadyProcessed = request.Items.Count - newItems.Count;

        if (newItems.Count == 0)
        {
            return new PushSyncResultDto(
                Accepted: 0,
                Applied: 0,
                Conflicts: 0,
                Rejected: 0,
                AlreadyProcessed: alreadyProcessed,
                AcknowledgedAt: DateTime.UtcNow,
                Items: []);
        }

        var now = DateTime.UtcNow;

        var logs = newItems.Select(item => new SyncLog
        {
            PatientId = request.PatientId,
            EntityType = item.EntityType,
            IdempotencyKey = item.IdempotencyKey,
            Operation = item.Operation,
            ClientTimestamp = item.ClientTimestamp,
            ServerTimestamp = now,
            Status = SyncStatus.Pending,
            PayloadJson = item.PayloadJson,
            EntityId = item.EntityId,
        }).ToList();

        await _syncLogRepository.AddRangeAsync(logs, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (_syncPayloadProcessor != null)
        {
            return await _syncPayloadProcessor.ProcessBatchAsync(
                request.PatientId,
                logs,
                alreadyProcessed,
                cancellationToken);
        }

        // Fallback when processor is not injected: enqueue Hangfire job
        _jobEnqueuer.EnqueueSyncPayload(request.PatientId, JsonSerializer.Serialize(
            newItems.Select(i => i.IdempotencyKey)));

        return new PushSyncResultDto(
            Accepted: newItems.Count,
            Applied: newItems.Count,
            Conflicts: 0,
            Rejected: 0,
            AlreadyProcessed: alreadyProcessed,
            AcknowledgedAt: DateTime.UtcNow,
            Items: logs.Select(l => new SyncItemResultDto(
                l.IdempotencyKey,
                l.EntityType,
                l.Operation.ToString(),
                null,
                l.EntityId,
                SyncStatus.Applied.ToString(),
                null)).ToList());
    }
}
