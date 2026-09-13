using System.Text.Json;
using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Sync.Commands.PushSyncPayload;

public sealed class PushSyncPayloadCommandHandler : IRequestHandler<PushSyncPayloadCommand, PushSyncAckDto>
{
    private readonly IPatientRepository _patientRepository;
    private readonly ISyncLogRepository _syncLogRepository;
    private readonly IBackgroundJobEnqueuer _jobEnqueuer;
    private readonly IUnitOfWork _unitOfWork;

    public PushSyncPayloadCommandHandler(
        IPatientRepository patientRepository,
        ISyncLogRepository syncLogRepository,
        IBackgroundJobEnqueuer jobEnqueuer,
        IUnitOfWork unitOfWork)
    {
        _patientRepository = patientRepository;
        _syncLogRepository = syncLogRepository;
        _jobEnqueuer = jobEnqueuer;
        _unitOfWork = unitOfWork;
    }

    public async Task<PushSyncAckDto> Handle(PushSyncPayloadCommand request, CancellationToken cancellationToken)
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

        if (newItems.Count > 0)
        {
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

            // Enqueue a Hangfire job to process this batch (implemented in Step 6)
            _jobEnqueuer.EnqueueSyncPayload(request.PatientId, JsonSerializer.Serialize(
                newItems.Select(i => i.IdempotencyKey)));
        }

        return new PushSyncAckDto(
            Accepted: newItems.Count,
            AlreadyProcessed: request.Items.Count - newItems.Count,
            AcknowledgedAt: DateTime.UtcNow);
    }
}
