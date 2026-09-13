using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Features.Files.Commands.GenerateUploadUrl;

namespace PatientAppBE.Api.Endpoints.Files;

public sealed class GenerateUploadUrlEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/files/uploads/intent", async (
                Guid patientId,
                GenerateUploadUrlRequest request,
                ISender sender,
                CancellationToken ct) =>
            {
                var response = await sender.Send(new GenerateUploadUrlCommand(
                    patientId,
                    request.FileId,
                    request.DocumentTypeId,
                    request.FolderId,
                    request.OriginalName,
                    request.ContentType,
                    request.SizeBytes,
                    request.EncryptionAlgorithm,
                    request.EncryptionKeyId,
                    request.EncryptionIvBase64,
                    request.EncryptionTagBase64,
                    request.EncryptedSizeBytes,
                    request.EncryptedHash,
                    request.WrappedKeyJson
                ), ct);
                return Results.Ok(ApiResponse<GenerateUploadUrlResponse>.Success(response));
            })
            .WithTags("Files")
            .WithName("GenerateUploadUrl")
            .WithSummary("Generate a pre-signed URL for uploading a file directly to R2")
            .WithDescription("Creates a new file entry in the database and generates a pre-signed Cloudflare R2 upload URL for the client to upload the file directly.")
            .Produces<ApiResponse<GenerateUploadUrlResponse>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed record GenerateUploadUrlRequest(
    Guid? FileId,
    Guid DocumentTypeId,
    Guid? FolderId,
    string OriginalName,
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
