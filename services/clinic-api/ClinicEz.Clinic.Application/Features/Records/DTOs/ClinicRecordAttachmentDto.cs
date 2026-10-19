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
    DateTime CreatedAt,
    string VerificationStatus = "Verified",
    string? RejectionReason = null,
    DateTime? VerifiedAt = null,
    Guid? VerifiedByStaffId = null,
    string? VerifiedByStaffName = null,
    string EncryptionAlgorithm = "AES-256-GCM",
    string? EncryptionKeyId = null,
    long? EncryptedSizeBytes = null,
    string? EncryptedHash = null);

