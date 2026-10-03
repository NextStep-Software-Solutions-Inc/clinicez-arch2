using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Shared.Licensing;

public class FacilityLicenseSigner : IFacilityLicenseSigner
{
    public const string DefaultAuthorityPrivateKeyPem = """
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIPNxFZsufhhG5VYYBM/uyvekBtWQ35AofCq5hvK/1WSHoAoGCCqGSM49
AwEHoUQDQgAElcH86gKVZB50A39lXdF4ic1xIUmYKWkfi0XuuzOnWSELSo2NW474
YcOHecbnhfLn+hHQeQmfFyGoOqkXUSbudQ==
-----END EC PRIVATE KEY-----
""";

    private readonly string _privateKeyPem;

    public FacilityLicenseSigner(IConfiguration? configuration = null)
    {
        _privateKeyPem = configuration?["FacilityLicense:PrivateKeyPem"]
            ?? Environment.GetEnvironmentVariable("FACILITY_LICENSE_PRIVATE_KEY")
            ?? DefaultAuthorityPrivateKeyPem;
    }

    public FacilityLicenseSigner(string privateKeyPem)
    {
        _privateKeyPem = privateKeyPem;
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
