namespace PatientApp.Application.Features.Files.Commands.GenerateUploadUrl;

public sealed record GenerateUploadUrlResponse(string StorageKey, string UploadUrl, DateTime ExpiresAt);
