using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class FileRecord : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid? ClinicId { get; set; }
    public Guid? FolderId { get; set; }
    public FileFolder? Folder { get; set; }

    public string FileName { get; set; } = string.Empty;
    public string? MimeType { get; set; }
    public string? Extension { get; set; }
    public long SizeBytes { get; set; }
    /// <summary>R2 object key — the authoritative storage location.</summary>
    public string StorageKey { get; set; } = string.Empty;
    public FileCategory Category { get; set; }
    public FileSyncStatus SyncStatus { get; set; } = FileSyncStatus.Local;
    public string? SyncError { get; set; }
    public DateTime UploadedAt { get; set; }

    // Client-side AES-256-GCM encryption metadata
    public string? EncryptionAlgorithm { get; set; } = "AES-256-GCM";
    public string? EncryptionKeyId { get; set; }
    public string? EncryptionIvBase64 { get; set; }
    public string? EncryptionTagBase64 { get; set; }
    public long? EncryptedSizeBytes { get; set; }
    public string? EncryptedHash { get; set; }
    public string? WrappedKeyJson { get; set; }
}
