using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.Shared.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Licensing;

public class FacilityLicenseValidator : IFacilityLicenseValidator
{
    private readonly IReadOnlyList<string> _publicKeyPems;

    /// <summary>
    /// Validates against the authority public key from configuration (<c>FacilityLicense:PublicKeyPem</c> /
    /// <c>FACILITY_LICENSE_PUBLIC_KEY</c>), plus the optional <c>FacilityLicense:PreviousPublicKeyPem</c> while keys are
    /// rotated. Outside Development a missing key throws here (fail fast); there is no built-in key.
    /// </summary>
    public FacilityLicenseValidator(IConfiguration? configuration = null, IHostEnvironment? environment = null)
    {
        var keys = new List<string> { LicenseKeyMaterial.ResolvePublicKey(configuration, environment) };
        var previous = LicenseKeyMaterial.ResolvePreviousPublicKey(configuration);
        if (previous is not null) keys.Add(previous);
        _publicKeyPems = Probe(keys);
    }

    public FacilityLicenseValidator(string publicKeyPem)
    {
        var pem = PemKey.Normalize(publicKeyPem, "public key")
            ?? throw new ArgumentException("A public key is required.", nameof(publicKeyPem));
        _publicKeyPems = Probe([pem]);
    }

    /// <summary>
    /// Public half of the per-machine Development/test authority key that <see cref="FacilityLicenseSigner"/> signs with
    /// when no key is configured. Throws outside Development.
    /// </summary>
    public static string DevelopmentAuthorityPublicKeyPem => LicenseKeyMaterial.DevelopmentPublicKey();

    /// <summary>Same as <see cref="DevelopmentAuthorityPublicKeyPem"/>; the old name, kept so existing test code compiles.</summary>
    public static string DefaultAuthorityPublicKeyPem => DevelopmentAuthorityPublicKeyPem;

    private static List<string> Probe(List<string> pems)
    {
        foreach (var pem in pems)
        {
            using var probe = PemKey.ImportEcdsa(pem, LicenseKeyMaterial.PublicKeySetting);
        }

        return pems;
    }
    public LicenseValidationResult Validate(string? licenseToken, Guid expectedFacilityId, string? expectedTenantId = null)
    {
        if (string.IsNullOrWhiteSpace(licenseToken))
        {
            return LicenseValidationResult.Missing("Facility license is missing or unactivated. Please provide a valid facility license key.");
        }

        var parts = licenseToken.Trim().Split('.');
        if (parts.Length != 2)
        {
            return LicenseValidationResult.Tampered("Malformed license token: expected format [payload].[signature].");
        }

        byte[] payloadBytes;
        byte[] signatureBytes;

        try
        {
            payloadBytes = Base64UrlHelper.Decode(parts[0]);
            signatureBytes = Base64UrlHelper.Decode(parts[1]);
        }
        catch (Exception ex)
        {
            return LicenseValidationResult.Tampered($"Invalid Base64Url encoding in license token: {ex.Message}");
        }

        // Asymmetric cryptographic signature verification (current key, then the previous one during a rotation)
        var isVerified = false;
        Exception? verificationError = null;
        foreach (var publicKeyPem in _publicKeyPems)
        {
            try
            {
                using var ecdsa = ECDsa.Create();
                ecdsa.ImportFromPem(publicKeyPem);
                if (ecdsa.VerifyData(payloadBytes, signatureBytes, HashAlgorithmName.SHA256))
                {
                    isVerified = true;
                    break;
                }
            }
            catch (Exception ex)
            {
                verificationError = ex;
            }
        }

        if (!isVerified)
        {
            return verificationError is not null
                ? LicenseValidationResult.Tampered($"Cryptographic verification error: {verificationError.Message}")
                : LicenseValidationResult.Tampered(
                    "Cryptographic signature verification failed. The license token or its embedded hard limits have been tampered with.");
        }

        // Deserialize signed payload
        FacilityLicensePayload? payload;
        try
        {
            var json = Encoding.UTF8.GetString(payloadBytes);
            payload = JsonSerializer.Deserialize<FacilityLicensePayload>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (payload == null)
            {
                return LicenseValidationResult.Tampered("Invalid license payload: Deserialized object was null.");
            }
        }
        catch (Exception ex)
        {
            return LicenseValidationResult.Tampered($"Failed to deserialize signed license payload: {ex.Message}");
        }

        // Facility binding check
        if (expectedFacilityId != Guid.Empty && payload.FacilityId != Guid.Empty && payload.FacilityId != expectedFacilityId)
        {
            return LicenseValidationResult.Tampered(
                $"License facility binding mismatch. Key belongs to facility '{payload.FacilityId}', but attempted to use with '{expectedFacilityId}'.");
        }

        // Tenant binding check
        if (!string.IsNullOrWhiteSpace(expectedTenantId) &&
            !string.IsNullOrWhiteSpace(payload.TenantId))
        {
            bool matchesId = string.Equals(payload.TenantId, expectedTenantId, StringComparison.OrdinalIgnoreCase);
            bool matchesSlug = !string.IsNullOrWhiteSpace(payload.TenantSlug) &&
                               string.Equals(payload.TenantSlug, expectedTenantId, StringComparison.OrdinalIgnoreCase);

            if (!matchesId && !matchesSlug)
            {
                return LicenseValidationResult.Tampered(
                    $"License tenant binding mismatch. Key belongs to tenant '{payload.TenantId}', but attempted to use with '{expectedTenantId}'.");
            }
        }

        // Expiration check
        if (payload.ExpiresAtUtc.HasValue && payload.ExpiresAtUtc.Value < DateTime.UtcNow)
        {
            var graceUntil = payload.ReadOnlyGraceUntil ?? payload.ExpiresAtUtc.Value.AddDays(payload.GraceDays);
            return LicenseValidationResult.Expired(
                payload,
                $"License expired on {payload.ExpiresAtUtc.Value:yyyy-MM-dd HH:mm:ss} UTC. The facility is operating in Grace Read-Only mode.",
                isReadOnlyGrace: graceUntil >= DateTime.UtcNow,
                readOnlyGraceUntilUtc: graceUntil);
        }

        return LicenseValidationResult.Success(payload);
    }
}
