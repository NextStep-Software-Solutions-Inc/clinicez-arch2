using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed record DocumentVerificationResult(
    bool IsVerified,
    string DocumentType,
    string DocumentNumber,
    string FacilityName,
    string? FacilityAddress,
    string? PatientMaskedName, // Strictly "Prescription Bearer" or "—" (Zero PHI)
    string? DoctorName,
    string? DoctorPrcLicense,
    string? IssueDate,
    string Status, // "VALID", "REVOKED", "DISPENSED", "EXPIRED"
    string SecurityDigest,
    string VerificationMessage,
    string? Notes = null
);

public sealed class PublicDocumentVerifyEndpoints : IEndpoint
{
    public const string RateLimitPolicy = "PublicApi";

    private static readonly HashSet<string> ValidKinds = new(StringComparer.OrdinalIgnoreCase)
    {
        "med-cert", "medical-certificate",
        "rx", "prescription",
        "referral",
        "lab-order", "lab-report", "lab",
        "receipt", "billing-receipt", "invoice"
    };

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        string[] verifyRoutes = [
            "/public/documents/verify/{token}",
            "/public/documents/verify/{kind}/{token}",
            "/public/verify/{token}",
            "/public/verify/{kind}/{token}"
        ];

        foreach (var route in verifyRoutes)
        {
            app.MapGet(route, VerifyDocumentAsync)
                .AllowAnonymous()
                .RequireRateLimiting(RateLimitPolicy)
                .WithTags("PublicDocumentVerification");
        }
    }

    public static string NormalizeKind(string kind) => kind.Trim().ToLowerInvariant() switch
    {
        "med-cert" or "medical-certificate" => "medical-certificate",
        "rx" or "prescription" => "rx",
        "referral" => "referral",
        "lab-order" or "lab" => "lab-order",
        "lab-report" => "lab-report",
        "receipt" or "billing-receipt" or "invoice" => "receipt",
        _ => kind.Trim().ToLowerInvariant()
    };

    public static bool KindsMatch(string? requestedKind, string documentKind)
    {
        if (string.IsNullOrWhiteSpace(requestedKind)) return true;
        return string.Equals(NormalizeKind(requestedKind), NormalizeKind(documentKind), StringComparison.OrdinalIgnoreCase);
    }

    public static async Task<IResult> VerifyDocumentAsync(
        string? kind,
        string token,
        string? sig,
        IApplicationDbContext context,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return Results.BadRequest(ApiResponse<DocumentVerificationResult>.Fail("Verification token or document number is required.", "REQUIRED_FIELD_MISSING"));
        }

        var cleanToken = token.Trim();
        var cleanKind = kind?.Trim().ToLowerInvariant();

        if (!string.IsNullOrWhiteSpace(cleanKind) && !ValidKinds.Contains(cleanKind))
        {
            return Results.BadRequest(ApiResponse<DocumentVerificationResult>.Fail($"Unrecognized document category '{kind}'.", "INVALID_DOCUMENT_KIND"));
        }

        // 1. Check if token is full SecurityDigest (or starts with SEC-SHA256-)
        string? searchDigest = cleanToken;
        if (!searchDigest.StartsWith(DocumentSecurityService.SecurityDigestPrefix, StringComparison.OrdinalIgnoreCase) && searchDigest.Length == 16)
        {
            searchDigest = $"{DocumentSecurityService.SecurityDigestPrefix}{searchDigest.ToUpperInvariant()}";
        }

        var digestMatches = await context.DocumentAttestations.AsNoTracking()
            .Where(d => d.SecurityDigest == searchDigest || d.SecurityDigest == cleanToken)
            .ToListAsync(ct);

        if (digestMatches.Count > 0)
        {
            var match = digestMatches.FirstOrDefault(d => KindsMatch(cleanKind, d.DocumentKind));
            if (match != null)
            {
                return ReturnVerified(match);
            }

            return Results.BadRequest(ApiResponse<DocumentVerificationResult>.Fail(
                $"The requested document reference is a {FormatDocumentKind(digestMatches[0].DocumentKind)}, not a {FormatDocumentKind(cleanKind!)}.",
                "DOCUMENT_KIND_MISMATCH"));
        }

        // 2. Check if token is PublicVerificationTokenHash for prescriptions
        using var sha256 = SHA256.Create();
        var tokenHash = Convert.ToHexString(sha256.ComputeHash(Encoding.UTF8.GetBytes(cleanToken.ToLowerInvariant()))).ToLowerInvariant();

        var rxMatch = await context.DocumentAttestations.AsNoTracking()
            .FirstOrDefaultAsync(d => d.VerificationTokenHash == tokenHash, ct);

        if (rxMatch != null)
        {
            if (!KindsMatch(cleanKind, rxMatch.DocumentKind))
            {
                return Results.BadRequest(ApiResponse<DocumentVerificationResult>.Fail(
                    $"The requested verification token is for an Electronic Prescription, not a {FormatDocumentKind(cleanKind!)}.",
                    "DOCUMENT_KIND_MISMATCH"));
            }

            return ReturnVerified(rxMatch);
        }

        // 3. Check by DocumentNumber (e.g. "MC-20261025-0001", "RX-20261025-0042")
        var allCandidates = await context.DocumentAttestations.AsNoTracking()
            .Where(d => d.DocumentNumber.ToUpper() == cleanToken.ToUpper())
            .ToListAsync(ct);

        if (allCandidates.Count > 0)
        {
            var candidates = allCandidates.Where(d => KindsMatch(cleanKind, d.DocumentKind)).ToList();

            if (candidates.Count == 0)
            {
                return Results.BadRequest(ApiResponse<DocumentVerificationResult>.Fail(
                    $"Document reference '{cleanToken}' is a {FormatDocumentKind(allCandidates[0].DocumentKind)}, not a {FormatDocumentKind(cleanKind!)}.",
                    "DOCUMENT_KIND_MISMATCH"));
            }

            // Multi-tenant collision check
            if (candidates.Select(c => c.TenantId).Distinct().Count() > 1)
            {
                if (string.IsNullOrWhiteSpace(sig))
                {
                    return Results.Conflict(ApiResponse<DocumentVerificationResult>.Fail(
                        "Ambiguous document number across multiple clinics. Please provide the security seal signature (?sig=) printed on the document.",
                        "DOCUMENT_NUMBER_AMBIGUOUS"));
                }

                var verifiedMatches = candidates.Where(c => DocumentSecurityService.VerifyShortSignature(c.SecurityDigest, sig)).ToList();
                if (verifiedMatches.Count == 1)
                {
                    return ReturnVerified(verifiedMatches[0]);
                }

                if (verifiedMatches.Count > 1)
                {
                    return Results.Conflict(ApiResponse<DocumentVerificationResult>.Fail(
                        "Cryptographic collision detected for seal across multiple organizations.",
                        "COLLISION_DETECTED"));
                }

                return Results.NotFound(ApiResponse<DocumentVerificationResult>.Fail(
                    "Document number verified but signature seal did not match.",
                    "SEAL_MISMATCH"));
            }

            var singleMatch = candidates[0];
            if (!string.IsNullOrWhiteSpace(sig))
            {
                if (!DocumentSecurityService.VerifyShortSignature(singleMatch.SecurityDigest, sig))
                {
                    return Results.BadRequest(ApiResponse<DocumentVerificationResult>.Fail(
                        "Security signature seal does not match the official record.",
                        "INVALID_SIGNATURE_SEAL"));
                }
            }

            return ReturnVerified(singleMatch);
        }

        return Results.NotFound(ApiResponse<DocumentVerificationResult>.Fail(
            "Unable to verify this document reference against the Clinic EZ registry.",
            "NOT_FOUND"));
    }

    private static IResult ReturnVerified(DocumentAttestation attestation)
    {
        var isExpired = attestation.ExpiresAtUtc.HasValue && attestation.ExpiresAtUtc.Value < DateTime.UtcNow;
        var status = attestation.Status ?? "VALID";
        if (isExpired && status == "VALID") status = "EXPIRED";

        var result = new DocumentVerificationResult(
            IsVerified: true,
            DocumentType: FormatDocumentKind(attestation.DocumentKind),
            DocumentNumber: attestation.DocumentNumber,
            FacilityName: attestation.ClinicName,
            FacilityAddress: attestation.ClinicAddress ?? "—",
            PatientMaskedName: "Prescription Bearer",
            DoctorName: attestation.DoctorName ?? "—",
            DoctorPrcLicense: attestation.DoctorPrcLicense ?? "—",
            IssueDate: attestation.IssuedAtUtc.ToString("yyyy-MM-dd HH:mm UTC"),
            Status: status,
            SecurityDigest: attestation.SecurityDigest,
            VerificationMessage: "Official cryptographic attestation verified against the Clinic EZ control plane registry."
        );

        return Results.Ok(ApiResponse<DocumentVerificationResult>.Success(result));
    }

    public static string FormatDocumentKind(string kind) => kind.ToLowerInvariant() switch
    {
        "medical-certificate" or "med-cert" => "Medical Certificate",
        "rx" or "prescription" => "Electronic Prescription",
        "referral" => "Clinical Referral Letter",
        "lab-order" or "lab" => "Laboratory Requisition",
        "lab-report" => "Diagnostic Laboratory Report",
        "receipt" or "billing-receipt" or "invoice" => "Official Billing Receipt",
        _ => "Clinical Healthcare Document"
    };
}
