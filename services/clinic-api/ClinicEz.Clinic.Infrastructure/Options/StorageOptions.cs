namespace ClinicEz.Clinic.Infrastructure.Options;

public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    public string Provider { get; set; } = "Local";
    public string BasePath { get; set; } = "Storage/Records";
    public bool EnableLocalFallback { get; set; } = true;
}
