using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Domain.Enums;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Sync.Queries.GetSyncStatus;

public sealed class GetSyncStatusQueryHandler : IRequestHandler<GetSyncStatusQuery, SyncStatusDto>
{
    private readonly IPatientRepository _patientRepository;
    private readonly ISyncLogRepository _syncLogRepository;

    public GetSyncStatusQueryHandler(IPatientRepository patientRepository, ISyncLogRepository syncLogRepository)
    {
        _patientRepository = patientRepository;
        _syncLogRepository = syncLogRepository;
    }

    public async Task<SyncStatusDto> Handle(GetSyncStatusQuery request, CancellationToken cancellationToken)
    {
        _ = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var logs = await _syncLogRepository.GetByPatientAsync(request.PatientId, request.Take, cancellationToken);

        var items = logs
            .Select(l => new SyncStatusItemDto(
                l.IdempotencyKey, l.EntityType, l.Operation.ToString(),
                l.Status.ToString(), l.ClientTimestamp, l.ServerTimestamp, l.ConflictDetail))
            .ToList()
            .AsReadOnly();

        return new SyncStatusDto(
            PendingCount: logs.Count(l => l.Status == SyncStatus.Pending),
            AppliedCount: logs.Count(l => l.Status == SyncStatus.Applied),
            RejectedCount: logs.Count(l => l.Status is SyncStatus.Rejected or SyncStatus.ConflictResolved),
            RecentItems: items);
    }
}
