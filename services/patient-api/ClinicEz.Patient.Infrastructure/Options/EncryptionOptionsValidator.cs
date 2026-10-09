using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Infrastructure.Options;

/// <summary>
/// Fails application start-up when payload encryption is enabled without a usable key, instead of
/// failing on the first request. There is no fallback key: an enabled deployment must supply one.
/// </summary>
public sealed class EncryptionOptionsValidator : IValidateOptions<EncryptionOptions>
{
    private const int KeyLengthBytes = 32;

    public ValidateOptionsResult Validate(string? name, EncryptionOptions options)
    {
        if (!options.Enabled)
            return ValidateOptionsResult.Success;

        if (string.IsNullOrWhiteSpace(options.Base64Key))
            return ValidateOptionsResult.Fail(
                "Encryption:Base64Key must be configured when Encryption:Enabled is true. " +
                "Set it via user-secrets or the ENCRYPTION__BASE64KEY environment variable.");

        Span<byte> buffer = stackalloc byte[KeyLengthBytes + 3];
        if (!Convert.TryFromBase64String(options.Base64Key, buffer, out var written) || written != KeyLengthBytes)
            return ValidateOptionsResult.Fail(
                "Encryption:Base64Key must be base64 that decodes to exactly 32 bytes (AES-256). " +
                "Generate one with: openssl rand -base64 32");

        return ValidateOptionsResult.Success;
    }
}
