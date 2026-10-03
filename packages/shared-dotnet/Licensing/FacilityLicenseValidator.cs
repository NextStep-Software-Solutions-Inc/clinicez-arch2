using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Shared.Licensing;

public class FacilityLicenseValidator : IFacilityLicenseValidator
{
    public const string DefaultAuthorityPublicKeyPem = """
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAElcH86gKVZB50A39lXdF4ic1xIUmY
KWkfi0XuuzOnWSELSo2NW474YcOHecbnhfLn+hHQeQmfFyGoOqkXUSbudQ==
-----END PUBLIC KEY-----
""";

    private readonly string _publicKeyPem;

    public FacilityLicenseValidator(IConfiguration? configuration = null)
    {
        _publicKeyPem = configuration?["FacilityLicense:PublicKeyPem"]
            ?? Environment.GetEnvironmentVariable("FACILITY_LICENSE_PUBLIC_KEY")
            ?? DefaultAuthorityPublicKeyPem;
    }

    public FacilityLicenseValidator(string publicKeyPem)
    {
        _publicKeyPem = publicKeyPem;
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

        // Asymmetric cryptographic signature verification
        try
        {
            using var ecdsa = ECDsa.Create();
            ecdsa.ImportFromPem(_publicKeyPem);

            bool isVerified = ecdsa.VerifyData(payloadBytes, signatureBytes, HashAlgorithmName.SHA256);
            if (!isVerified)
            {
                return LicenseValidationResult.Tampered(
                    "Cryptographic signature verification failed. The license token or its embedded hard limits have been tampered with.");
            }
        }
        catch (Exception ex)
        {
            return LicenseValidationResult.Tampered($"Cryptographic verification error: {ex.Message}");
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
            !string.IsNullOrWhiteSpace(payload.TenantId) &&
            !string.Equals(payload.TenantId, expectedTenantId, StringComparison.OrdinalIgnoreCase))
        {
            return LicenseValidationResult.Tampered(
                $"License tenant binding mismatch. Key belongs to tenant '{payload.TenantId}', but attempted to use with '{expectedTenantId}'.");
        }

        // Expiration check
        if (payload.ExpiresAtUtc.HasValue && payload.ExpiresAtUtc.Value < DateTime.UtcNow)
        {
            return LicenseValidationResult.Expired(
                payload,
                $"License expired on {payload.ExpiresAtUtc.Value:yyyy-MM-dd HH:mm:ss} UTC. The facility is operating in Grace Read-Only mode.");
        }

        return LicenseValidationResult.Success(payload);
    }
}
