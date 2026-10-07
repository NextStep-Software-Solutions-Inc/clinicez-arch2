using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Shared.LocalAuth;

/// <summary>
/// Resolves the HMAC signing key for facility-local JWTs. Uses the configured key when present;
/// otherwise generates a 256-bit key once and persists it so tokens survive restarts without any secret provisioning.
/// </summary>
public static class SigningKeyProvider
{
    private const int MinKeyBytes = 32;
    private static readonly object Gate = new();

    public static byte[] Resolve(FacilityJwtOptions options, ILogger? logger = null)
    {
        if (!string.IsNullOrWhiteSpace(options.SigningKey))
        {
            var configured = DecodeKey(options.SigningKey!.Trim());
            if (configured.Length < MinKeyBytes)
            {
                throw new InvalidOperationException(
                    $"Jwt:SigningKey must be at least {MinKeyBytes} bytes (256 bits). Provide a longer key or leave it empty to auto-generate.");
            }
            return configured;
        }

        var directory = string.IsNullOrWhiteSpace(options.KeyDirectory)
            ? Path.Combine(AppContext.BaseDirectory, "keys")
            : options.KeyDirectory!;
        var fileName = SanitizeFileName(options.Audience) + ".jwt.key";
        var path = Path.Combine(directory, fileName);

        lock (Gate)
        {
            if (File.Exists(path))
            {
                var existing = DecodeKey(File.ReadAllText(path).Trim());
                if (existing.Length >= MinKeyBytes) return existing;
            }

            Directory.CreateDirectory(directory);
            var generated = RandomNumberGenerator.GetBytes(64);
            File.WriteAllText(path, Convert.ToBase64String(generated));
            logger?.LogWarning(
                "[LocalAuth] Generated a new JWT signing key at {Path}. Mount this directory on a persistent volume, or set Jwt:SigningKey, so sessions survive container re-creation.",
                path);
            return generated;
        }
    }

    private static byte[] DecodeKey(string value)
    {
        try
        {
            var bytes = Convert.FromBase64String(value);
            if (bytes.Length >= MinKeyBytes) return bytes;
        }
        catch (FormatException)
        {
            // fall through to raw UTF-8
        }
        return Encoding.UTF8.GetBytes(value);
    }

    private static string SanitizeFileName(string value)
    {
        var name = string.IsNullOrWhiteSpace(value) ? "facility" : value;
        foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
        return name;
    }
}
