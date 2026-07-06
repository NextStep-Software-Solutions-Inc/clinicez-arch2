namespace PatientApp.Application.Features.Files.Queries.GetFileConfig;

public sealed record FileConfigDto(string? EncryptedMAK, long QuotaBytes, long UsedBytes);
