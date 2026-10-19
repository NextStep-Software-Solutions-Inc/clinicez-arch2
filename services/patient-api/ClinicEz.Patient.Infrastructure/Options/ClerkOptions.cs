namespace ClinicEz.Patient.Infrastructure.Options;

public sealed class ClerkOptions
{
    public string Authority { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;

    /// <summary>
    /// Signing secret from Clerk Dashboard -> Webhooks.
    /// Injected via UserSecrets in dev or CLERK__WEBHOOKSECRET env var in production.
    /// Never stored in appsettings.json.
    /// </summary>
    public string? WebhookSecret { get; set; }
}
