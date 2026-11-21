using System;
using ClinicEz.Comms.Domain.Enums;

namespace ClinicEz.Comms.Domain.Entities;

public class MessageAttachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;

    public Guid? MessageId { get; set; }
    public Message? Message { get; set; }

    public string OriginalFileName { get; set; } = string.Empty;
    public string SafeFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long OriginalSizeBytes { get; set; }
    public long SanitizedSizeBytes { get; set; }

    public string StoragePath { get; set; } = string.Empty;
    public string SHA256Checksum { get; set; } = string.Empty;

    public AttachmentStatus Status { get; set; } = AttachmentStatus.Scanning;
    public string? QuarantineReason { get; set; }

    public bool StrippedExif { get; set; }
    public string? ConvertedFromOriginal { get; set; }

    public string EncryptionAlgorithm { get; set; } = "AES-256-GCM";
    public string EncryptionKeyId { get; set; } = "cmk-v1";
    public string EncryptionIvBase64 { get; set; } = string.Empty;
    public string EncryptionTagBase64 { get; set; } = string.Empty;
    public string WrappedKeyJson { get; set; } = string.Empty;

    public bool IsFiledToChart { get; set; }
    public DateTime? FiledAtUtc { get; set; }
    public string? FiledByStaffId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ScannedAtUtc { get; set; }
}
