using System.Security.Cryptography;
using System.Text;

namespace ClinicEz.Interop.Application.Security;

/// <summary>
/// PBKDF2-SHA256 hashing of client secrets with a per-client random salt and constant-time comparison.
/// Stored form: <c>pbkdf2-sha256$iterations$salt$hash</c> (base64).
/// </summary>
public static class SecretHasher
{
    private const string Prefix = "pbkdf2-sha256";
    private const int SaltBytes = 16;
    private const int HashBytes = 32;
    private static readonly string DummyHash = Hash("timing-equaliser", 1000);

    public static string Hash(string secret, int iterations)
    {
        ArgumentException.ThrowIfNullOrEmpty(secret);
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(secret), salt, iterations, HashAlgorithmName.SHA256, HashBytes);
        return $"{Prefix}${iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string secret, string stored)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != Prefix || !int.TryParse(parts[1], out var iterations) || iterations < 1) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(secret), salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    /// <summary>Spends comparable time for an unknown client id so response timing does not reveal which ids exist.</summary>
    public static void BurnVerify(string secret) => Verify(secret, DummyHash);

    /// <summary>A new 256-bit URL-safe secret.</summary>
    public static string GenerateSecret() => ToUrlSafe(RandomNumberGenerator.GetBytes(32));

    public static string ToUrlSafe(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
