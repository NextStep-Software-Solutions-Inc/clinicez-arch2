using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Features.Files.Commands.GenerateUploadUrl;

namespace PatientApp.Api.Endpoints.Files;

public sealed class GenerateUploadUrlEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/files/uploads/presigned-url", async (
                Guid patientId,
                GenerateUploadUrlRequest request,
                ISender sender,
                CancellationToken ct) =>
            {
                var response = await sender.Send(new GenerateUploadUrlCommand(patientId, request.ContentType, request.FileExtension), ct);
                return Results.Ok(ApiResponse<GenerateUploadUrlResponse>.Success(response));
            })
            .WithTags("Files")
            .WithName("GenerateUploadUrl")
            .WithSummary("Generate a pre-signed URL for uploading a file directly to R2")
            .Produces<ApiResponse<GenerateUploadUrlResponse>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed record GenerateUploadUrlRequest(string ContentType, string FileExtension);
