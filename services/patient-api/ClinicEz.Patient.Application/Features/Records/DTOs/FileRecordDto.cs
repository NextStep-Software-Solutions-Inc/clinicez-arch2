using System;

namespace ClinicEz.Patient.Application.Features.Records.DTOs;

public sealed record FileRecordDto(
    Guid Id,
    Guid ClientId,
    string FileName,
    string? MimeType,
    string? Extension,
    long SizeBytes,
    Guid DocumentTypeId,
    string? DocumentTypeName,
    string Title,
    DateOnly? DocumentDate,
    string? FacilityName,
    string? Notes,
    DateTime UploadedAt,
    string StorageKey
);
