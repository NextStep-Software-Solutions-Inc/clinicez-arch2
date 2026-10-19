using System.Security.Cryptography;
using System.Text;

namespace ClinicEz.Shared.Security;

/// <summary>
/// Reads the ECDSA P-256 keys the platform is configured with (license authority keys, hub envelope signing keys).
/// A configured value is either a PEM block or the base64 of one (a single line, so it fits an environment variable or
/// a GitHub secret). A literal <c>\n</c> in a PEM value is accepted as a line break for the same reason.
/// </summary>
public static class PemKey
{
    /// <summary>
    /// Returns the PEM text for <paramref name="value"/>, or <c>null</c> when it is blank. Throws when the value is
    /// neither a PEM block nor the base64 of one, naming <paramref name="settingName"/> in the message.
    /// </summary>
    public static string? Normalize(string? value, string settingName)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var text = value.Trim();
        if (text.Contains("-----BEGIN", StringComparison.Ordinal))
            return text.Replace("\\r\\n", "\n", StringComparison.Ordinal).Replace("\\n", "\n", StringComparison.Ordinal);

        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(string.Concat(text.Where(c => !char.IsWhiteSpace(c)))));
            if (decoded.Contains("-----BEGIN", StringComparison.Ordinal)) return decoded.Trim();
        }
        catch (FormatException)
        {
            // fall through to the descriptive error below
        }

        throw new InvalidOperationException($"{settingName} must be a PEM key or the base64 of a PEM key.");
    }

    /// <summary>Imports an EC key (private or public PEM) and checks it is on the P-256 curve.</summary>
    public static ECDsa ImportEcdsa(string pem, string settingName)
    {
        var ecdsa = ECDsa.Create();
        try
        {
            ecdsa.ImportFromPem(pem);
            if (ecdsa.KeySize != 256)
                throw new InvalidOperationException($"{settingName} must be an ECDSA P-256 key (it is {ecdsa.KeySize} bit).");
            return ecdsa;
        }
        catch (Exception ex) when (ex is ArgumentException or CryptographicException)
        {
            ecdsa.Dispose();
            throw new InvalidOperationException($"{settingName} is not a valid EC key: {ex.Message}", ex);
        }
        catch
        {
            ecdsa.Dispose();
            throw;
        }
    }

    /// <summary>The public key (PEM) belonging to a private key PEM.</summary>
    public static string DerivePublicPem(string privatePem, string settingName)
    {
        using var ecdsa = ImportEcdsa(privatePem, settingName);
        return ecdsa.ExportSubjectPublicKeyInfoPem();
    }

    /// <summary>Generates a P-256 pair; both halves are returned as base64 of the PEM (ready for env vars).</summary>
    public static (string PrivateKey, string PublicKey) GenerateP256Base64()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        return (ToBase64(ecdsa.ExportECPrivateKeyPem()), ToBase64(ecdsa.ExportSubjectPublicKeyInfoPem()));
    }

    public static string ToBase64(string pem) => Convert.ToBase64String(Encoding.UTF8.GetBytes(pem.Trim() + "\n"));
}
