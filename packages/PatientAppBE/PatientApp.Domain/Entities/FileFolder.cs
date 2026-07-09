using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

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
