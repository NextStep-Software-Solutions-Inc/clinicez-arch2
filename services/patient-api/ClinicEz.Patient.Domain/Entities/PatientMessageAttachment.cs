using System;
using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientMessageAttachment : BaseEntity
{
    public Guid? MessageId { get; set; }
    public PatientMessage? Message { get; set; }

    public Guid? PatientId { get; set; }

    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string StorageKey { get; set; } = string.Empty;
    public bool IsClean { get; set; } = true;
    public string ScanStatus { get; set; } = "Clean";
    public string? HashSha256 { get; set; }

    public string? EncryptionAlgorithm { get; set; } = "AES-256-GCM";
    public string? EncryptionIvBase64 { get; set; }
    public string? EncryptionTagBase64 { get; set; }
    public string? WrappedKeyJson { get; set; }
}
