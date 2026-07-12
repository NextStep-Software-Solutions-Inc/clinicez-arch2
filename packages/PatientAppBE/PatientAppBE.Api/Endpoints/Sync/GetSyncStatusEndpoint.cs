using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Application.Features.Sync.Queries.GetSyncStatus;

namespace PatientAppBE.Api.Endpoints.Sync;

public sealed class GetSyncStatusEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/sync/status", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct,
                int take = 50) =>
            {
                var status = await sender.Send(new GetSyncStatusQuery(patientId, take), ct);
                return Results.Ok(ApiResponse<SyncStatusDto>.Success(status));
            })
            .WithTags("Sync")
            .WithName("GetSyncStatus")
            .WithSummary("Get the sync processing status and recent log entries for a patient")
            .WithDescription("Retrieves the processing status, last sync timestamp, and log audit trail of offline-to-online synchronizations for a patient.")
            .Produces<ApiResponse<SyncStatusDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
