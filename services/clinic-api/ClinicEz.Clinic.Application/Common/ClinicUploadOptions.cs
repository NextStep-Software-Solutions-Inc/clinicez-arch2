namespace ClinicEz.Clinic.Application.Common;

/// <summary>
/// Settings for results uploaded against a lab order by an external lab or the patient. Bound from the
/// <c>Clinic</c> configuration section (<c>Clinic__PortalBaseUrl</c> in the environment) or <c>PORTAL_BASE_URL</c>.
/// </summary>
public sealed class ClinicUploadOptions
{
    public const string SectionName = "Clinic";

    /// <summary>
    /// Public, absolute base URL of the portal web app (e.g. https://portal.example.com).
    /// The upload dropzone URL is automatically constructed as <c>{PortalBaseUrl}/upload/lab/{token}</c>.
    /// </summary>
    public string? PortalBaseUrl { get; set; }

    public long UploadMaxBytes { get; set; } = 10 * 1024 * 1024;

    public string[] UploadAllowedContentTypes { get; set; } = ["application/pdf", "image/jpeg", "image/png"];

    public int UploadGrantTtlDays { get; set; } = 30;

    public int UploadMaxUploads { get; set; } = 3;
}
