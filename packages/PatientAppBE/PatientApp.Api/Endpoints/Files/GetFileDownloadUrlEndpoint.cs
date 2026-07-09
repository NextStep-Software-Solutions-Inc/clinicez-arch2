using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Features.Files.Queries.GetFileDownloadUrl;

namespace PatientApp.Api.Endpoints.Files;

public sealed class GetFileDownloadUrlEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/files/{id:guid}/download-url", async (
                Guid patientId,
                Guid id,
                ISender sender,
                CancellationToken ct) =>
            {
                var downloadUrl = await sender.Send(new GetFileDownloadUrlQuery(patientId, id), ct);
                return Results.Ok(ApiResponse<GetFileDownloadUrlResponse>.Success(new GetFileDownloadUrlResponse(downloadUrl)));
            })
            .WithTags("Files")
            .WithName("GetFileDownloadUrl")
            .WithSummary("Generate a pre-signed URL for securely downloading a file from R2")
            .Produces<ApiResponse<GetFileDownloadUrlResponse>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}

public sealed record GetFileDownloadUrlResponse(string DownloadUrl);
