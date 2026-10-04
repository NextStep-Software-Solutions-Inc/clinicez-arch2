using System;
using System.Security.Cryptography;
using System.Text;

namespace ClinicEz.Shared.Documents.Security;

public interface IDocumentSecurityService
{
    string ComputeDocumentDigest(string tenantId, string docType, string docNumber, Guid? patientId, string? doctorOrStaffPrc, DateTime issuedAt);
    string GenerateVerificationUrl(string baseUrl, string docType, string token, string digest);
    bool VerifyDigest(string tenantId, string docType, string docNumber, Guid? patientId, string? doctorOrStaffPrc, DateTime issuedAt, string providedDigest);
}

public class DocumentSecurityService : IDocumentSecurityService
{
    private static readonly byte[] DefaultSecret = Encoding.UTF8.GetBytes("ClinicEz-Standard-Healthcare-Security-Key-2026!#@%");
    private readonly byte[] _secretKey;

    public DocumentSecurityService(string? signingKey = null)
    {
        _secretKey = string.IsNullOrWhiteSpace(signingKey) ? DefaultSecret : Encoding.UTF8.GetBytes(signingKey);
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
