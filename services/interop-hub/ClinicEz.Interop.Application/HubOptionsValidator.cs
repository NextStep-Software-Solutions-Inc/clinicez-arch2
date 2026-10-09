using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application;

/// <summary>Fail-fast configuration checks (run at host start).</summary>
public sealed class HubOptionsValidator : IValidateOptions<HubOptions>
{
    public ValidateOptionsResult Validate(string? name, HubOptions o)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(o.CloudCellId) || o.CloudCellId.Contains(':')) errors.Add("Hub:CloudCellId is required and must not contain ':'.");
        if (o.MaxEnvelopeBytes < 1024) errors.Add("Hub:MaxEnvelopeBytes must be at least 1024.");
        if (o.MaxDeliveryAttempts < 1) errors.Add("Hub:MaxDeliveryAttempts must be at least 1.");
        if (o.VisibilityTimeoutSeconds < 1) errors.Add("Hub:VisibilityTimeoutSeconds must be at least 1.");
        if (o.MessageTtlDays < 1) errors.Add("Hub:MessageTtlDays must be at least 1.");
        if (o.Auth.Pbkdf2Iterations < 1) errors.Add("Hub:Auth:Pbkdf2Iterations must be at least 1.");

        if (!string.IsNullOrWhiteSpace(o.PayloadEncryptionKey))
        {
            try
            {
                if (Convert.FromBase64String(o.PayloadEncryptionKey).Length != 32)
                    errors.Add("Hub:PayloadEncryptionKey must be the base64 encoding of exactly 32 bytes.");
            }
            catch (FormatException)
            {
                errors.Add("Hub:PayloadEncryptionKey must be valid base64.");
            }
        }

        if (o.IsLocal)
        {
            if (string.IsNullOrWhiteSpace(o.LocalCellId) || o.LocalCellId.Contains(':')) errors.Add("Hub:LocalCellId is required in Local mode and must not contain ':'.");
            if (!Uri.TryCreate(o.Upstream.Url, UriKind.Absolute, out _)) errors.Add("Hub:Upstream:Url must be an absolute URL in Local mode.");
            if (string.IsNullOrWhiteSpace(o.Upstream.ClientId)) errors.Add("Hub:Upstream:ClientId is required in Local mode.");
            if (string.IsNullOrWhiteSpace(o.Upstream.ClientSecret)) errors.Add("Hub:Upstream:ClientSecret is required in Local mode.");
        }

        return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
    }
}
