using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.Documents;
using ClinicEz.Patient.Application.Features.Sync.Queries.GetSyncChanges;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.Patient.Api.Endpoints.Sync;

public sealed class GetSyncChangesEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/sync/changes", async (
                Guid patientId, ISender sender, CancellationToken ct,
                string? since = null, int take = GetSyncChangesQueryHandler.DefaultPageSize) =>
            {
                var changes = await sender.Send(new GetSyncChangesQuery(patientId, since, take), ct);
                return Results.Ok(ApiResponse<SyncChangesDto>.Success(changes));
            })
            .WithTags("Sync")
            .WithName("GetSyncChanges")
            .WithSummary("Pull the read-only clinical rows facilities wrote for the patient since a cursor")
            .WithDescription("Lab requests, prescriptions, lab results, medical certificates, access grants and notifications changed after the cursor. Pass the returned cursor as 'since' and repeat while hasMore is true.")
            .Produces<ApiResponse<SyncChangesDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .RequireAuthorization();
    }
}
