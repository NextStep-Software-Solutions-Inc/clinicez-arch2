namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DocumentSignatoryConfig
{
    public string? PreparedByTitle { get; set; }
    public string? ApproverName { get; set; }
    public string? ApproverTitle { get; set; }
}
