using PatientAppBE.Domain.Common;

namespace PatientAppBE.Domain.Entities;

public sealed class PatientStorageProfile : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    
    // Abstract payload to store the Master Account Key (E2EE)
    public string? EncryptedMAK { get; set; }

    public long QuotaBytes { get; set; }
    public long UsedBytes { get; set; }
}
