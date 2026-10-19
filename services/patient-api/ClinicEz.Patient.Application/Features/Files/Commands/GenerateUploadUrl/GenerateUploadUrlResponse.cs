namespace ClinicEz.Patient.Application.Features.Files.Commands.GenerateUploadUrl;

public sealed record GenerateUploadUrlResponse(Guid FileId, string StorageKey, string UploadUrl, DateTime ExpiresAt);
