using PatientAppBE.Domain.Common;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Domain.Entities;

public sealed class FileFolder : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public Guid? ParentId { get; set; }
    public FileFolder? Parent { get; set; }
    public string Name { get; set; } = string.Empty;
    public FileSyncStatus SyncStatus { get; set; } = FileSyncStatus.Local;
    public string? SyncError { get; set; }

    public ICollection<FileFolder> Children { get; set; } = [];
    public ICollection<FileRecord> Files { get; set; } = [];
}
