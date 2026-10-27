using System;
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

        // 1. Check if token is full SecurityDigest (or starts with SEC-SHA256-)
        string? searchDigest = cleanToken;
        if (!searchDigest.StartsWith(DocumentSecurityService.SecurityDigestPrefix, StringComparison.OrdinalIgnoreCase) && searchDigest.Length == 16)
        {
            searchDigest = $"{DocumentSecurityService.SecurityDigestPrefix}{searchDigest.ToUpperInvariant()}";
        }

        var digestMatch = await context.DocumentAttestations.AsNoTracking()
            .FirstOrDefaultAsync(d => d.SecurityDigest == searchDigest || d.SecurityDigest == cleanToken, ct);

        if (digestMatch != null)
        {
            return ReturnVerified(digestMatch);
        }

        // 2. Check if token is PublicVerificationTokenHash for prescriptions
        using var sha256 = SHA256.Create();
        var tokenHash = Convert.ToHexString(sha256.ComputeHash(Encoding.UTF8.GetBytes(cleanToken.ToLowerInvariant()))).ToLowerInvariant();

        var rxMatch = await context.DocumentAttestations.AsNoTracking()
            .FirstOrDefaultAsync(d => d.VerificationTokenHash == tokenHash, ct);

        if (rxMatch != null)
        {
            return ReturnVerified(rxMatch);
        }

        // 3. Check by DocumentNumber (e.g. "MC-20261025-0001", "RX-20261025-0042")
        var candidatesQuery = context.DocumentAttestations.AsNoTracking()
            .Where(d => d.DocumentNumber.ToUpper() == cleanToken.ToUpper());

        if (!string.IsNullOrWhiteSpace(cleanKind))
        {
            candidatesQuery = candidatesQuery.Where(d => d.DocumentKind.ToLower() == cleanKind);
        }

        var candidates = await candidatesQuery.ToListAsync(ct);

        if (candidates.Count == 0)
        {
            return Results.NotFound(ApiResponse<DocumentVerificationResult>.Fail(
                "Unable to verify this document reference against the Clinic EZ registry.",
                "NOT_FOUND"));
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

    private static string FormatDocumentKind(string kind) => kind.ToLowerInvariant() switch
    {
        "medical-certificate" or "med-cert" => "Medical Certificate",
        "rx" or "prescription" => "Electronic Prescription",
        "referral" => "Clinical Referral Letter",
        "lab-order" => "Laboratory Requisition",
        "lab-report" => "Diagnostic Laboratory Report",
        "receipt" => "Official Billing Receipt",
        _ => "Clinical Healthcare Document"
    };
}
