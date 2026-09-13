using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Sync.Commands.PushSyncPayload;

public sealed record PushSyncPayloadCommand(
    Guid PatientId,
    IReadOnlyList<SyncItemRequest> Items) : IRequest<PushSyncAckDto>;
