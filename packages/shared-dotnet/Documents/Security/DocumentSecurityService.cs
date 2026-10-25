using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using ClinicEz.Shared.Licensing;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Documents.Security;

public interface IDocumentSecurityService
{
    string ComputeDocumentDigest(string tenantId, string docType, string docNumber, Guid? patientId, string? doctorOrStaffPrc, DateTime issuedAt);
    string GenerateVerificationUrl(string baseUrl, string docType, string token, string digest);
    string? GenerateVerificationUrl(string baseUrl, string docType, string token, string digest, bool includePublicVerificationUrl);
    bool VerifyDigest(string tenantId, string docType, string docNumber, Guid? patientId, string? doctorOrStaffPrc, DateTime issuedAt, string providedDigest);
    bool VerifyShortSignature(string? storedDigest, string? candidateSig);
}

public class DocumentSecurityService : IDocumentSecurityService
{
    public const string SigningKeySetting = "Documents:SigningKey";
    public const string SigningKeyEnvironmentVariable = "DOCUMENT_SIGNING_KEY";
    public const string SecurityDigestPrefix = "SEC-SHA256-";
    public const int ShortSignatureLength = 12;

    public static readonly IReadOnlySet<string> InternalReportTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "daily-eod",
        "doh-morbidity",
        "bir-tax-audit",
        "doctor-shares",
        "clinic-analytics"
    };

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
        return $"{SecurityDigestPrefix}{hexString[..16].ToUpperInvariant()}";
    }

    public string GenerateVerificationUrl(string baseUrl, string docType, string token, string digest)
    {
        return GenerateVerificationUrl(baseUrl, docType, token, digest, includePublicVerificationUrl: true) ?? string.Empty;
    }

    public string? GenerateVerificationUrl(string baseUrl, string docType, string token, string digest, bool includePublicVerificationUrl)
    {
        if (!includePublicVerificationUrl)
            return null;

        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(docType) ||
            string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(digest))
        {
            return null;
        }

        var cleanBase = baseUrl.TrimEnd('/');
        var cleanDigest = digest.Trim();
        if (cleanDigest.StartsWith(SecurityDigestPrefix, StringComparison.OrdinalIgnoreCase))
        {
            cleanDigest = cleanDigest[SecurityDigestPrefix.Length..];
        }

        if (cleanDigest.Length < ShortSignatureLength)
        {
            return null;
        }

        var sigShort = cleanDigest[..ShortSignatureLength];
        return $"{cleanBase}/verify/{docType.Trim().ToLowerInvariant()}/{Uri.EscapeDataString(token.Trim())}?sig={sigShort}";
    }

    public bool VerifyDigest(string tenantId, string docType, string docNumber, Guid? patientId, string? doctorOrStaffPrc, DateTime issuedAt, string providedDigest)
    {
        if (string.IsNullOrWhiteSpace(providedDigest)) return false;
        var computed = ComputeDocumentDigest(tenantId, docType, docNumber, patientId, doctorOrStaffPrc, issuedAt);
        var cleanProvided = providedDigest.Trim();
        if (cleanProvided.Length != computed.Length) return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computed.ToUpperInvariant()),
            Encoding.UTF8.GetBytes(cleanProvided.ToUpperInvariant()));
    }

    bool IDocumentSecurityService.VerifyShortSignature(string? storedDigest, string? candidateSig) =>
        VerifyShortSignature(storedDigest, candidateSig);

    public static bool VerifyShortSignature(string? storedDigest, string? candidateSig)
    {
        if (string.IsNullOrWhiteSpace(storedDigest) || string.IsNullOrWhiteSpace(candidateSig))
            return false;

        var cleanStored = storedDigest.Trim();
        var cleanCandidate = candidateSig.Trim();

        if (cleanStored.StartsWith(SecurityDigestPrefix, StringComparison.OrdinalIgnoreCase))
        {
            cleanStored = cleanStored[SecurityDigestPrefix.Length..];
        }

        if (cleanCandidate.StartsWith(SecurityDigestPrefix, StringComparison.OrdinalIgnoreCase))
        {
            cleanCandidate = cleanCandidate[SecurityDigestPrefix.Length..];
        }

        if (cleanStored.Length < ShortSignatureLength || cleanCandidate.Length != ShortSignatureLength)
            return false;

        var expectedUpper = cleanStored[..ShortSignatureLength].ToUpperInvariant();
        var candidateUpper = cleanCandidate.ToUpperInvariant();

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expectedUpper),
            Encoding.UTF8.GetBytes(candidateUpper));
    }

    public static bool IsInternalReportType(string? docType) =>
        !string.IsNullOrWhiteSpace(docType) && InternalReportTypes.Contains(docType.Trim());
}
