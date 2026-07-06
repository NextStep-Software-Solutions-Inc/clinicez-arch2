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
                var command = new CompleteFileUploadCommand(
                    patientId,
                    request.FolderId,
                    request.OriginalName,
                    request.StorageKey,
                    request.ContentType,
                    request.SizeBytes,
                    request.EncryptionAlgorithm,
                    request.EncryptionKeyId,
                    request.EncryptionIvBase64,
                    request.EncryptionTagBase64,
                    request.EncryptedSizeBytes,
                    request.EncryptedHash,
                    request.WrappedKeyJson
                );

                var fileId = await sender.Send(command, ct);
                return Results.Ok(ApiResponse<CompleteFileUploadResponse>.Success(new CompleteFileUploadResponse(fileId)));
            })
            .WithTags("Files")
            .WithName("CompleteFileUpload")
            .WithSummary("Complete a file upload and save the metadata and E2EE encryption details")
            .Produces<ApiResponse<CompleteFileUploadResponse>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed record CompleteFileUploadRequest(
    Guid? FolderId,
    string OriginalName,
    string StorageKey,
    string ContentType,
    long SizeBytes,
    string EncryptionAlgorithm,
    string EncryptionKeyId,
    string EncryptionIvBase64,
    string EncryptionTagBase64,
    long EncryptedSizeBytes,
    string EncryptedHash,
    string WrappedKeyJson
);

public sealed record CompleteFileUploadResponse(Guid FileId);
