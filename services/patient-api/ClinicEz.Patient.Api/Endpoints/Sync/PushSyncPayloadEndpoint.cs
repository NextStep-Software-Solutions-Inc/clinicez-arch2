using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Sync.Commands.PushSyncPayload;

namespace ClinicEz.Patient.Api.Endpoints.Sync;

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
                var result = await sender.Send(new PushSyncPayloadCommand(patientId, request.Items), ct);

                return Results.Ok(
                    ApiResponse<PushSyncResultDto>.Success(
                        result,
                        $"Synced {result.Applied} item(s). {result.Conflicts} conflict(s). {result.AlreadyProcessed} already processed."));
            })
            .WithTags("Sync")
            .WithName("PushSyncPayload")
            .WithSummary("Push a batch of offline changes to be processed synchronously by the server with ID mappings returned")
            .WithDescription("Pushes a batch of locally queued modifications from the client to the server, applies them with Last-Write-Wins conflict resolution, and returns canonical server IDs.")
            .Produces<ApiResponse<PushSyncResultDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
