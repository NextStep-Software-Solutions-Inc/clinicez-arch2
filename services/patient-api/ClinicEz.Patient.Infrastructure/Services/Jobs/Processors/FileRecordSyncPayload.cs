namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

public sealed class FileRecordSyncPayload
{
    public Guid ClientId { get; set; }
    public Guid? FolderId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; }
}
