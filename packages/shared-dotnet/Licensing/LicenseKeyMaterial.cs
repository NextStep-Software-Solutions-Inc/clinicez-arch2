using System.Security.Cryptography;
using ClinicEz.Shared.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Licensing;

/// <summary>
/// Resolves the license authority keys. There is no compiled-in key: outside Development the keys must be configured
/// (<c>FacilityLicense:PrivateKeyPem</c> / <c>FACILITY_LICENSE_PRIVATE_KEY</c> for the signer,
/// <c>FacilityLicense:PublicKeyPem</c> / <c>FACILITY_LICENSE_PUBLIC_KEY</c> for validators), as PEM or base64 of PEM.
/// In Development (or when <c>DOTNET_ENVIRONMENT</c>/<c>ASPNETCORE_ENVIRONMENT</c> is Development, or <c>CLINICEZ_DEV_KEYS=true</c>, which is how the test projects
/// run) a per-machine authority key is generated once and persisted to
/// <c>%LOCALAPPDATA%/ClinicEz/dev-license-authority-key.pem</c> (override the folder with <c>CLINICEZ_DEV_KEY_DIR</c>)
/// so locally running services and tests agree on it. That key never leaves the developer machine.
/// </summary>
internal static class LicenseKeyMaterial
{
    public const string PrivateKeySetting = "FacilityLicense:PrivateKeyPem";
    public const string PublicKeySetting = "FacilityLicense:PublicKeyPem";
    public const string PreviousPublicKeySetting = "FacilityLicense:PreviousPublicKeyPem";
    public const string PrivateKeyEnvironmentVariable = "FACILITY_LICENSE_PRIVATE_KEY";
    public const string PublicKeyEnvironmentVariable = "FACILITY_LICENSE_PUBLIC_KEY";
    public const string PreviousPublicKeyEnvironmentVariable = "FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS";

    /// <summary>Set to <c>true</c> (the repository's test runsettings do) to allow the development key outside a Development host.</summary>
    public const string DevelopmentKeysVariable = "CLINICEZ_DEV_KEYS";

    private static readonly Lazy<string> DevelopmentPrivateKey = new(LoadOrCreateDevelopmentKey, LazyThreadSafetyMode.ExecutionAndPublication);

    public static bool IsDevelopment(IHostEnvironment? environment)
    {
        if (environment is not null) return environment.IsDevelopment();
        var name = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
        return string.Equals(name, Environments.Development, StringComparison.OrdinalIgnoreCase)
               || string.Equals(Environment.GetEnvironmentVariable(DevelopmentKeysVariable), "true", StringComparison.OrdinalIgnoreCase);
    }

    public static string ResolvePrivateKey(IConfiguration? configuration, IHostEnvironment? environment)
    {
        var configured = PemKey.Normalize(Pick(configuration?[PrivateKeySetting], PrivateKeyEnvironmentVariable), PrivateKeySetting);
        if (configured is not null) return configured;
        if (IsDevelopment(environment)) return DevelopmentPrivateKey.Value;

        throw new InvalidOperationException(
            $"The facility license signing key is not configured. Set {PrivateKeySetting} (environment variable {PrivateKeyEnvironmentVariable}) " +
            "to the authority's ECDSA P-256 private key, as PEM or base64 of PEM (see scripts/generate-license-keys). " +
            "There is no built-in key outside Development.");
    }

    public static string ResolvePublicKey(IConfiguration? configuration, IHostEnvironment? environment)
    {
        var configured = PemKey.Normalize(Pick(configuration?[PublicKeySetting], PublicKeyEnvironmentVariable), PublicKeySetting);
        if (configured is not null) return configured;
        if (IsDevelopment(environment)) return DeriveDevelopmentPublicKey();

        throw new InvalidOperationException(
            $"The facility license public key is not configured. Set {PublicKeySetting} (environment variable {PublicKeyEnvironmentVariable}) " +
            "to the authority's ECDSA P-256 public key, as PEM or base64 of PEM (the portal hands it out with the facility credentials). " +
            "There is no built-in key outside Development.");
    }

    /// <summary>The previous authority public key, accepted next to the current one while keys are rotated (optional).</summary>
    public static string? ResolvePreviousPublicKey(IConfiguration? configuration) =>
        PemKey.Normalize(Pick(configuration?[PreviousPublicKeySetting], PreviousPublicKeyEnvironmentVariable), PreviousPublicKeySetting);

    /// <summary>Per-machine HMAC secret for document digests in Development, derived from the development authority key.</summary>
    public static byte[] DevelopmentDocumentSecret() =>
        System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("clinicez-dev-document-signing|" + DevelopmentPrivateKey.Value));

    public static string DevelopmentPublicKey()
    {
        if (!IsDevelopment(null))
            throw new InvalidOperationException("The development license authority key is only available when the environment is Development.");
        return DeriveDevelopmentPublicKey();
    }

    private static string DeriveDevelopmentPublicKey() =>
        PemKey.DerivePublicPem(DevelopmentPrivateKey.Value, "development license authority key");

    private static string? Pick(string? configured, string environmentVariable) =>
        !string.IsNullOrWhiteSpace(configured) ? configured : Environment.GetEnvironmentVariable(environmentVariable);

    private static string LoadOrCreateDevelopmentKey()
    {
        try
        {
            var directory = Environment.GetEnvironmentVariable("CLINICEZ_DEV_KEY_DIR");
            if (string.IsNullOrWhiteSpace(directory))
            {
                var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                directory = Path.Combine(string.IsNullOrEmpty(local) ? Path.GetTempPath() : local, "ClinicEz");
            }

            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, "dev-license-authority-key.pem");

            // Several processes (test hosts, services) may start at once: create atomically, and let the loser read the winner's file.
            for (var attempt = 0; attempt < 5; attempt++)
            {
                var existing = TryReadKey(path);
                if (existing is not null) return existing;

                using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
                var pem = ecdsa.ExportECPrivateKeyPem();
                var temp = Path.Combine(directory, $".{Guid.NewGuid():N}.tmp");
                File.WriteAllText(temp, pem);
                if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(temp, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                try
                {
                    File.Move(temp, path);
                    return pem;
                }
                catch (IOException)
                {
                    File.Delete(temp);
                }
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // No writable profile (read-only container, restricted CI): an in-memory key still works for one process.
        }

        using var ephemeral = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        return ephemeral.ExportECPrivateKeyPem();
    }

    private static string? TryReadKey(string path)
    {
        if (!File.Exists(path)) return null;
        try
        {
            var pem = File.ReadAllText(path);
            using var probe = PemKey.ImportEcdsa(pem, path);
            return pem;
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException)
        {
            return null;
        }
    }
}
