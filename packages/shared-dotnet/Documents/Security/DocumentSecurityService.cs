using System;
using System.Security.Cryptography;
using System.Text;
using ClinicEz.Shared.Licensing;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Documents.Security;

public interface IDocumentSecurityService
{
    string ComputeDocumentDigest(string tenantId, string docType, string docNumber, Guid? patientId, string? doctorOrStaffPrc, DateTime issuedAt);
    string GenerateVerificationUrl(string baseUrl, string docType, string token, string digest);
    bool VerifyDigest(string tenantId, string docType, string docNumber, Guid? patientId, string? doctorOrStaffPrc, DateTime issuedAt, string providedDigest);
}

public class DocumentSecurityService : IDocumentSecurityService
{
    public const string SigningKeySetting = "Documents:SigningKey";
    public const string SigningKeyEnvironmentVariable = "DOCUMENT_SIGNING_KEY";

    private readonly byte[] _secretKey;

    /// <summary>
    /// HMAC key for document digests (<c>Documents:SigningKey</c> / <c>DOCUMENT_SIGNING_KEY</c>, a long random secret). There is
    /// no built-in key: outside Development a missing key throws; in Development (see <see cref="Licensing.LicenseKeyMaterial"/>)
    /// a per-machine key derived from the development authority key is used.
    /// </summary>
    public DocumentSecurityService(string? signingKey = null, IHostEnvironment? environment = null)
    {
        if (!string.IsNullOrWhiteSpace(signingKey))
            _secretKey = Encoding.UTF8.GetBytes(signingKey);
        else if (LicenseKeyMaterial.IsDevelopment(environment))
            _secretKey = LicenseKeyMaterial.DevelopmentDocumentSecret();
        else
            throw new InvalidOperationException(
                $"The document signing key is not configured. Set {SigningKeySetting} (environment variable {SigningKeyEnvironmentVariable}) to a long random secret. " +
                "There is no built-in key outside Development.");
    }

    public string ComputeDocumentDigest(string tenantId, string docType, string docNumber, Guid? patientId, string? doctorOrStaffPrc, DateTime issuedAt)
    {
        // Canonical payload representation
        var rawPayload = $"{tenantId.Trim().ToLowerInvariant()}|{docType.Trim().ToUpperInvariant()}|{docNumber.Trim()}|{patientId?.ToString() ?? "GUEST"}|{doctorOrStaffPrc?.Trim().ToUpperInvariant() ?? "UNASSIGNED"}|{issuedAt.ToString("yyyy-MM-ddTHH:mm:ssZ")}";
        using var hmac = new HMACSHA256(_secretKey);
        var hashBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(rawPayload));
        var hexString = Convert.ToHexString(hashBytes);
        return $"SEC-SHA256-{hexString[..16].ToUpperInvariant()}";
    }

    public string GenerateVerificationUrl(string baseUrl, string docType, string token, string digest)
    {
        var cleanBase = baseUrl.TrimEnd('/');
        var sigShort = digest.Replace("SEC-SHA256-", "")[..12];
        return $"{cleanBase}/verify/{docType.ToLowerInvariant()}/{Uri.EscapeDataString(token)}?sig={sigShort}";
    }

    public bool VerifyDigest(string tenantId, string docType, string docNumber, Guid? patientId, string? doctorOrStaffPrc, DateTime issuedAt, string providedDigest)
    {
        if (string.IsNullOrWhiteSpace(providedDigest)) return false;
        var computed = ComputeDocumentDigest(tenantId, docType, docNumber, patientId, doctorOrStaffPrc, issuedAt);
        return string.Equals(computed, providedDigest.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}
