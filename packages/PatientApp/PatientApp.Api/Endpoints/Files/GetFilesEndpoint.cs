using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Features.Files.Queries.GetFiles;

namespace PatientApp.Api.Endpoints.Files;

public sealed class GetFilesEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/files", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct) =>
            {
                var response = await sender.Send(new GetFilesQuery(patientId), ct);
                return Results.Ok(ApiResponse<GetFilesResponse>.Success(response));
            })
            .WithTags("Files")
            .WithName("GetFiles")
            .WithSummary("Get all files and folders for a patient")
            .Produces<ApiResponse<GetFilesResponse>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
