using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Features.Files.Commands.CompleteFileUpload;

namespace PatientApp.Api.Endpoints.Files;

public sealed class CompleteFileUploadEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/files/uploads/complete", async (
                Guid patientId,
                CompleteFileUploadRequest request,
                ISender sender,
                CancellationToken ct) =>
            {
                var command = new CompleteFileUploadCommand(request.FileId);

                var fileId = await sender.Send(command, ct);
                return Results.Ok(ApiResponse<CompleteFileUploadResponse>.Success(new CompleteFileUploadResponse(fileId)));
            })
            .WithTags("Files")
            .WithName("CompleteFileUpload")
            .WithSummary("Complete a file upload by transitioning its status to Synced")
            .Produces<ApiResponse<CompleteFileUploadResponse>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed record CompleteFileUploadRequest(Guid FileId);

public sealed record CompleteFileUploadResponse(Guid FileId);
