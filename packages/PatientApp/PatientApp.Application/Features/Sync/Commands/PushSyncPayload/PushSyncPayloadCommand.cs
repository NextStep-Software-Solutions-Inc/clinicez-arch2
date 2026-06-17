using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Sync.Commands.PushSyncPayload;

public sealed record PushSyncPayloadCommand(
    Guid PatientId,
    IReadOnlyList<SyncItemRequest> Items) : IRequest<PushSyncAckDto>;
