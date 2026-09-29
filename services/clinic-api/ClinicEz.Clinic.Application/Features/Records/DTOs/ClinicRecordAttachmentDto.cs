using System;

namespace ClinicEz.Clinic.Application.Features.Records.DTOs;

public sealed record ClinicRecordAttachmentDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid PatientId,
    Guid? ConsultationId,
    string RecordType,
    string Title,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    string StorageUri,
    DateOnly DocumentDate,
    string? Notes,
    Guid? UploadedByStaffId,
    string? UploadedByStaffName,
    DateTime CreatedAt);
