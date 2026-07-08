namespace PatientApp.Infrastructure.Services.Jobs.Processors;

public sealed class FileFolderSyncPayload
{
    public Guid ClientId { get; set; }
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; }
}
