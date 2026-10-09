namespace ClinicEz.Patient.Application.Features.Documents;

/// <summary>Limits for files that enter the patient's record: uploaded lab results, receipts and report PDFs from laboratories.</summary>
public static class PatientFileLimits
{
    public const long MaxFileBytes = 10 * 1024 * 1024;

    /// <summary>How long the clinic has to download a file from the link it is sent.</summary>
    public static readonly TimeSpan ClinicDownloadWindow = TimeSpan.FromDays(7);

    public static readonly IReadOnlySet<string> AllowedContentTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf", "image/jpeg", "image/png", "image/heic"
    };

    public static bool IsPdfOrImage(string? contentType) =>
        contentType is not null && AllowedContentTypes.Contains(contentType);

    public static string SafeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        var cleaned = new string(name.Select(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_' ? c : '_').ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "file" : cleaned.Length > 100 ? cleaned[^100..] : cleaned;
    }
}
