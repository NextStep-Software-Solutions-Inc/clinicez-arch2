namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

public sealed class FileRecordSyncPayload
{
    public Guid ClientId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public DateOnly? DocumentDate { get; set; }
    public string? FacilityName { get; set; }
    public string? Notes { get; set; }
    public DateTime UpdatedAt { get; set; }
}
