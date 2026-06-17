namespace PatientApp.Infrastructure.Options;

/// <summary>
/// Configuration for AES-256-GCM payload encryption.
///
/// <para><b>IMPORTANT:</b> <see cref="Base64Key"/> is a 32-byte secret and must NEVER be placed
/// in appsettings.json. Set it via user-secrets in development or the
/// <c>ENCRYPTION__BASE64KEY</c> environment variable in production / CI.</para>
/// </summary>
public sealed class EncryptionOptions
{
    /// <summary>Whether payload encryption is active. Set to false in Development.</summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Base64-encoded 32-byte (256-bit) AES key. Required when <see cref="Enabled"/> is true.
    /// Generate with: <c>openssl rand -base64 32</c>
    /// </summary>
    public string? Base64Key { get; set; }
}
