namespace ClinicEz.Clinic.Application.Common;

/// <summary>
/// Settings for results uploaded against a lab order by an external lab or the patient. Bound from the
/// <c>Clinic</c> configuration section (<c>Clinic__PublicUploadBaseUrl</c> in the environment).
/// </summary>
public sealed class ClinicUploadOptions
{
    public const string SectionName = "Clinic";

    /// <summary>
    /// Public, absolute base URL of the upload page; a slip links to <c>{PublicUploadBaseUrl}/{token}</c>. Required
    /// to issue a lab order: there is no sensible default because only the deployment knows its public address.
    /// </summary>
    public string? PublicUploadBaseUrl { get; set; }

    public long UploadMaxBytes { get; set; } = 10 * 1024 * 1024;

    public string[] UploadAllowedContentTypes { get; set; } = ["application/pdf", "image/jpeg", "image/png"];

    public int UploadGrantTtlDays { get; set; } = 30;

    public int UploadMaxUploads { get; set; } = 3;
}
