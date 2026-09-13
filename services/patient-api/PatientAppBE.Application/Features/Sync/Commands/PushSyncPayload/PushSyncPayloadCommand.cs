using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Sync.Commands.PushSyncPayload;

public sealed record PushSyncPayloadCommand(
    Guid PatientId,
    IReadOnlyList<SyncItemRequest> Items) : IRequest<PushSyncAckDto>;
