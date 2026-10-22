namespace ClinicEz.Patient.Application.Features.DocumentTypes.DTOs;

public sealed record DocumentTypeDto(
    Guid Id,
    string Code,
    string Label,
    string? Description,
    List<string> SupportedExtensions,
    List<string> SupportedMimeTypes,
    string NativePreviewKind,
    int SortOrder,
    bool IsActive);
