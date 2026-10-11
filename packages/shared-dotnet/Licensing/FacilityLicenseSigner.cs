using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.Shared.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Licensing;

/// <summary>
/// Signs facility licenses with the authority's ECDSA P-256 private key. Only the portal holds that key. There is no
/// built-in key: see <see cref="LicenseKeyMaterial"/> for how it is configured and the Development behaviour.
/// </summary>
public class FacilityLicenseSigner : IFacilityLicenseSigner
{
    private readonly string _privateKeyPem;

    public FacilityLicenseSigner(IConfiguration? configuration = null, IHostEnvironment? environment = null)
    {
        _privateKeyPem = LicenseKeyMaterial.ResolvePrivateKey(configuration, environment);
        using var probe = PemKey.ImportEcdsa(_privateKeyPem, LicenseKeyMaterial.PrivateKeySetting);
    }

    public FacilityLicenseSigner(string privateKeyPem)
    {
        _privateKeyPem = PemKey.Normalize(privateKeyPem, "private key")
            ?? throw new ArgumentException("A private key is required.", nameof(privateKeyPem));
    }

    public string SignLicense(FacilityLicensePayload payload)
    {
        ArgumentNullException.ThrowIfNull(payload);

        var payloadJson = JsonSerializer.Serialize(payload, new JsonSerializerOptions
        {
            WriteIndented = false
        });

        byte[] payloadBytes = Encoding.UTF8.GetBytes(payloadJson);

        using var ecdsa = ECDsa.Create();
        ecdsa.ImportFromPem(_privateKeyPem);

        byte[] signatureBytes = ecdsa.SignData(payloadBytes, HashAlgorithmName.SHA256);

        string encodedPayload = Base64UrlHelper.Encode(payloadBytes);
        string encodedSignature = Base64UrlHelper.Encode(signatureBytes);

        return $"{encodedPayload}.{encodedSignature}";
    }
}
