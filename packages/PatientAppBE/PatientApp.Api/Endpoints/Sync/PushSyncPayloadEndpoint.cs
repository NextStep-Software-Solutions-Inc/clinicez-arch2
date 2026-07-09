using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Sync.Commands.PushSyncPayload;

namespace PatientApp.Api.Endpoints.Sync;

public sealed record PushSyncPayloadRequest(IReadOnlyList<SyncItemRequest> Items);

public sealed class PushSyncPayloadEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/sync", async (
                Guid patientId,
                PushSyncPayloadRequest request,
                ISender sender,
                CancellationToken ct) =>
            {
                var ack = await sender.Send(new PushSyncPayloadCommand(patientId, request.Items), ct);

                return Results.Accepted(
                    (string?)null,
                    ApiResponse<PushSyncAckDto>.Success(
                        ack,
                        $"Accepted {ack.Accepted} item(s). {ack.AlreadyProcessed} already processed."));
            })
            .WithTags("Sync")
            .WithName("PushSyncPayload")
            .WithSummary("Push a batch of offline changes to be queued and processed by the server")
            .Produces<ApiResponse<PushSyncAckDto>>(StatusCodes.Status202Accepted)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
