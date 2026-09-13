namespace ClinicEz.Patient.Application.Features.Files.Queries.GetFileConfig;

public sealed record FileConfigDto(string? EncryptedMAK, long QuotaBytes, long UsedBytes, List<DocumentTypeDto> DocumentTypes);

public sealed record DocumentTypeDto(
    Guid Id,
    string Code,
    string Label,
    string? Description,
    List<string> SupportedExtensions,
    List<string> SupportedMimeTypes,
    string NativePreviewKind,
    int SortOrder,
    bool IsActive
);
