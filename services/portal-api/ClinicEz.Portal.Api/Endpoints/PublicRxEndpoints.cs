using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed record RxAttestationInfo(
    string PrescriptionNumber,
    string ClinicName,
    string? ClinicAddress,
    string? ClinicContact,
    string? DoctorName,
    string? DoctorPrcLicense,
    string? DoctorPtr,
    string? DoctorS2License,
    DateTime IssuedAt,
    DateTime? ExpiresAt,
    bool IsExpired,
    string Status, // "ACTIVE", "DISPENSED", "EXPIRED", "REVOKED"
    string DispenseStatus, // "Pending", "Dispensed", "DispensedExternally"
    bool IsValid,
    bool IsAlreadyDispensed,
    string? DispensedPharmacyName,
    DateTime? DispensedAt,
    bool HasDangerousDrug,
    int ItemCount,
    string SyncStatus, // "Synced", "PendingClinicSync"
    bool IsOfflinePending = false
);

public sealed record SubmitRxDispenseBody(
    string ExternalPharmacyName,
    string? ExternalBranchLocation = null,
    string? PharmacistName = null,
    string? PharmacistPrcLicense = null,
    string? OfficialReceiptNumber = null,
    string? Notes = null,
    string? ReceiptDocumentUrl = null
);

public sealed class PublicRxEndpoints : IEndpoint
{
    public const string RateLimitPolicy = "PublicApi";
    public const long MaxReceiptFileSizeBytes = 5_242_880; // 5 MiB
    private const int MultipartOverheadBytes = 64 * 1024;

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        // 1. Query endpoints (support /public/rx/{token}, /public/rx-upload/{token}/info, /public/rx-upload/{token}, /public/rx-verify/{token})
        string[] infoRoutes = [
            "/public/rx/{token}",
            "/public/rx-upload/{token}/info",
            "/public/rx-upload/{token}",
            "/public/rx-verify/{token}"
        ];

        foreach (var route in infoRoutes)
        {
            app.MapGet(route, GetRxAttestationInfoAsync)
                .AllowAnonymous()
                .RequireRateLimiting(RateLimitPolicy)
                .WithTags("PublicRx");
        }

        // 2. Dispense endpoints (support JSON body and multipart)
        string[] dispenseRoutes = [
            "/public/rx/{token}/dispense",
            "/public/rx-upload/{token}",
            "/public/rx-verify/{token}/dispense"
        ];

        foreach (var route in dispenseRoutes)
        {
            app.MapPost(route, SubmitDispenseJsonAsync)
                .AllowAnonymous()
                .DisableAntiforgery()
                .RequireRateLimiting(RateLimitPolicy)
                .WithTags("PublicRx");
        }

        app.MapPost("/public/rx-upload/{token}/multipart", SubmitDispenseMultipartAsync)
            .AllowAnonymous()
            .DisableAntiforgery()
            .RequireRateLimiting(RateLimitPolicy)
            .WithTags("PublicRx");

        app.MapPost("/public/rx/{token}/multipart", SubmitDispenseMultipartAsync)
            .AllowAnonymous()
            .DisableAntiforgery()
            .RequireRateLimiting(RateLimitPolicy)
            .WithTags("PublicRx");
    }

    public static async Task<IResult> GetRxAttestationInfoAsync(
        string token,
        IApplicationDbContext context,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return Results.BadRequest(ApiResponse<RxAttestationInfo>.Fail("Prescription token is required.", "REQUIRED_FIELD_MISSING"));
        }

        var cleanToken = token.Trim().ToLowerInvariant();
        var tokenHash = ComputeTokenHash(cleanToken);

        // 1. Try DocumentAttestation lookup by verification token hash
        var attestation = await context.DocumentAttestations.AsNoTracking()
            .FirstOrDefaultAsync(a => a.VerificationTokenHash == tokenHash, ct);

        if (attestation != null)
        {
            if (attestation.DocumentKind != "prescription" && attestation.DocumentKind != "rx")
            {
                return Results.BadRequest(ApiResponse<RxAttestationInfo>.Fail(
                    $"This token belongs to a {attestation.DocumentKind} document, not an electronic prescription.",
                    "DOCUMENT_KIND_MISMATCH"));
            }

            return ReturnAttestationInfo(attestation);
        }

        // 2. Reject non-prescription document references by number or digest
        var docByNumber = await context.DocumentAttestations.AsNoTracking()
            .FirstOrDefaultAsync(a => a.DocumentNumber.ToLower() == cleanToken || a.SecurityDigest.ToLower() == cleanToken, ct);

        if (docByNumber != null)
        {
            if (docByNumber.DocumentKind != "prescription" && docByNumber.DocumentKind != "rx")
            {
                return Results.BadRequest(ApiResponse<RxAttestationInfo>.Fail(
                    $"Document reference '{cleanToken}' was found, but it is a {docByNumber.DocumentKind}, not an electronic prescription.",
                    "DOCUMENT_KIND_MISMATCH"));
            }

            return ReturnAttestationInfo(docByNumber);
        }

        if (cleanToken.StartsWith("mc-") || cleanToken.StartsWith("ref-") || cleanToken.StartsWith("lab-") || cleanToken.StartsWith("sec-sha256-"))
        {
            return Results.BadRequest(ApiResponse<RxAttestationInfo>.Fail(
                "The provided reference is for a non-prescription clinical document.",
                "DOCUMENT_KIND_MISMATCH"));
        }

        // 3. Offline Edge Cell Fallback: Extract clinicId from token prefix {clinicId:N}.{secret}
        if (cleanToken.Length >= 33 && cleanToken[32] == '.' && Guid.TryParseExact(cleanToken[..32], "N", out var clinicId))
        {
            var facility = await context.Facilities.AsNoTracking()
                .Include(f => f.Tenant)
                .FirstOrDefaultAsync(f => f.Id == clinicId && !f.IsDeleted, ct);

            if (facility != null && facility.Status == FacilityStatus.Active)
            {
                // Return 200 with PendingClinicSync status so pharmacy does not get 404
                var fallbackInfo = new RxAttestationInfo(
                    PrescriptionNumber: "RX-PENDING-SYNC",
                    ClinicName: facility.Name,
                    ClinicAddress: facility.StreetAddress,
                    ClinicContact: facility.ContactNumber,
                    DoctorName: "Prescribing Clinician (Pending Edge Sync)",
                    DoctorPrcLicense: null,
                    DoctorPtr: null,
                    DoctorS2License: null,
                    IssuedAt: DateTime.UtcNow,
                    ExpiresAt: DateTime.UtcNow.AddDays(7),
                    IsExpired: false,
                    Status: "ACTIVE",
                    DispenseStatus: "Pending",
                    IsValid: true,
                    IsAlreadyDispensed: false,
                    DispensedPharmacyName: null,
                    DispensedAt: null,
                    HasDangerousDrug: false,
                    ItemCount: 1,
                    SyncStatus: "PendingClinicSync",
                    IsOfflinePending: true
                );

                return Results.Ok(ApiResponse<RxAttestationInfo>.Success(fallbackInfo, "Attestation pending edge sync from clinic cell."));
            }
        }

        return Results.NotFound(ApiResponse<RxAttestationInfo>.Fail("Prescription not found or invalid verification token.", "NOT_FOUND"));
    }

    private static IResult ReturnAttestationInfo(DocumentAttestation attestation)
    {
        var isRevoked = string.Equals(attestation.Status, "REVOKED", StringComparison.OrdinalIgnoreCase);
        var isExpired = attestation.ExpiresAtUtc.HasValue && attestation.ExpiresAtUtc.Value < DateTime.UtcNow;
        var isDispensed = attestation.IsAlreadyDispensed || string.Equals(attestation.Status, "DISPENSED", StringComparison.OrdinalIgnoreCase);

        var info = new RxAttestationInfo(
            PrescriptionNumber: attestation.DocumentNumber,
            ClinicName: attestation.ClinicName,
            ClinicAddress: attestation.ClinicAddress,
            ClinicContact: attestation.ClinicContact,
            DoctorName: attestation.DoctorName,
            DoctorPrcLicense: attestation.DoctorPrcLicense,
            DoctorPtr: attestation.DoctorPtr,
            DoctorS2License: attestation.DoctorS2License,
            IssuedAt: attestation.IssuedAtUtc,
            ExpiresAt: attestation.ExpiresAtUtc,
            IsExpired: isExpired,
            Status: isRevoked ? "REVOKED" : (isDispensed ? "DISPENSED" : (isExpired ? "EXPIRED" : "ACTIVE")),
            DispenseStatus: attestation.DispenseStatus ?? (isDispensed ? "DispensedExternally" : "Pending"),
            IsValid: !isRevoked,
            IsAlreadyDispensed: isDispensed,
            DispensedPharmacyName: attestation.DispensedPharmacyName,
            DispensedAt: attestation.DispensedAtUtc,
            HasDangerousDrug: attestation.HasDangerousDrug,
            ItemCount: attestation.ItemCount,
            SyncStatus: "Synced",
            IsOfflinePending: false
        );

        return Results.Ok(ApiResponse<RxAttestationInfo>.Success(info));
    }

    public static async Task<IResult> SubmitDispenseJsonAsync(
        string token,
        SubmitRxDispenseBody body,
        IApplicationDbContext context,
        IInteropPublisher publisher,
        ILogger<PublicRxEndpoints> logger,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(body.ExternalPharmacyName))
        {
            return Results.BadRequest(ApiResponse<object>.Fail("Token and external pharmacy name are required.", "REQUIRED_FIELD_MISSING"));
        }

        return await ProcessDispenseRelayAsync(
            token,
            body.ExternalPharmacyName,
            body.ExternalBranchLocation,
            body.PharmacistName,
            body.PharmacistPrcLicense,
            body.OfficialReceiptNumber,
            body.Notes,
            receiptBytes: null,
            receiptFileName: null,
            receiptContentType: null,
            receiptBase64: body.ReceiptDocumentUrl,
            context,
            publisher,
            logger,
            ct);
    }

    public static async Task<IResult> SubmitDispenseMultipartAsync(
        string token,
        HttpContext httpContext,
        IApplicationDbContext context,
        IInteropPublisher publisher,
        ILogger<PublicRxEndpoints> logger,
        CancellationToken ct = default)
    {
        var maxBody = MaxReceiptFileSizeBytes + MultipartOverheadBytes;
        var sizeFeature = httpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (sizeFeature is { IsReadOnly: false }) sizeFeature.MaxRequestBodySize = maxBody;

        if (httpContext.Request.ContentLength > maxBody)
        {
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        }

        if (!httpContext.Request.HasFormContentType)
        {
            return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
        }

        IFormCollection form;
        try
        {
            form = await httpContext.Request.ReadFormAsync(ct);
        }
        catch (Exception ex) when (ex is BadHttpRequestException or InvalidDataException)
        {
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        }

        var pharmacyName = form["externalPharmacyName"].ToString();
        if (string.IsNullOrWhiteSpace(pharmacyName)) pharmacyName = "External Pharmacy";

        var branchLocation = form["externalBranchLocation"].ToString();
        var pharmacistName = form["pharmacistName"].ToString();
        var pharmacistPrcLicense = form["pharmacistPrcLicense"].ToString();
        var receiptNumber = form["officialReceiptNumber"].ToString();
        var notes = form["notes"].ToString();

        byte[]? receiptBytes = null;
        string? fileName = null;
        string? contentType = null;

        var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
        if (file != null && file.Length > 0)
        {
            if (file.Length > MaxReceiptFileSizeBytes)
            {
                return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            }

            using var ms = new MemoryStream((int)file.Length);
            await file.CopyToAsync(ms, ct);
            receiptBytes = ms.ToArray();
            fileName = file.FileName;
            contentType = file.ContentType;

            if (!ValidateReceiptFileType(contentType, receiptBytes))
            {
                return Results.BadRequest(ApiResponse<object>.Fail("Invalid receipt file type. Only PDF, JPEG, and PNG files are accepted.", "INVALID_FILE_TYPE"));
            }
        }

        return await ProcessDispenseRelayAsync(
            token,
            pharmacyName,
            branchLocation,
            pharmacistName,
            pharmacistPrcLicense,
            receiptNumber,
            notes,
            receiptBytes,
            fileName,
            contentType,
            receiptBase64: null,
            context,
            publisher,
            logger,
            ct);
    }

    private static async Task<IResult> ProcessDispenseRelayAsync(
        string token,
        string pharmacyName,
        string? branchLocation,
        string? pharmacistName,
        string? pharmacistPrcLicense,
        string? receiptNumber,
        string? notes,
        byte[]? receiptBytes,
        string? receiptFileName,
        string? receiptContentType,
        string? receiptBase64,
        IApplicationDbContext context,
        IInteropPublisher publisher,
        ILogger<PublicRxEndpoints> logger,
        CancellationToken ct)
    {
        var cleanToken = token.Trim().ToLowerInvariant();

        if (cleanToken.StartsWith("mc-") || cleanToken.StartsWith("ref-") || cleanToken.StartsWith("lab-"))
        {
            return Results.BadRequest(ApiResponse<object>.Fail("The provided token is for a clinical document, not an e-prescription.", "DOCUMENT_KIND_MISMATCH"));
        }

        var tokenHash = ComputeTokenHash(cleanToken);

        // Check if token belongs to another document kind
        var anyAttestation = await context.DocumentAttestations.AsNoTracking()
            .FirstOrDefaultAsync(a => a.VerificationTokenHash == tokenHash, ct);

        if (anyAttestation != null && anyAttestation.DocumentKind != "prescription" && anyAttestation.DocumentKind != "rx")
        {
            return Results.BadRequest(ApiResponse<object>.Fail(
                $"Token belongs to a {PublicDocumentVerifyEndpoints.FormatDocumentKind(anyAttestation.DocumentKind)}, not an e-prescription.",
                "DOCUMENT_KIND_MISMATCH"));
        }

        Guid targetFacilityId = Guid.Empty;
        string targetTenantId = string.Empty;
        Guid prescriptionId = Guid.Empty;
        string prescriptionNumber = "RX-DISPENSED";

        var attestation = (anyAttestation != null && (anyAttestation.DocumentKind == "prescription" || anyAttestation.DocumentKind == "rx"))
            ? await context.DocumentAttestations.FirstOrDefaultAsync(a => a.Id == anyAttestation.Id, ct)
            : null;

        if (attestation != null)
        {
            if (attestation.IsAlreadyDispensed || string.Equals(attestation.Status, "DISPENSED", StringComparison.OrdinalIgnoreCase))
            {
                return Results.Conflict(ApiResponse<object>.Fail("This prescription has already been dispensed.", "ALREADY_DISPENSED"));
            }

            if (attestation.ExpiresAtUtc.HasValue && attestation.ExpiresAtUtc.Value < DateTime.UtcNow)
            {
                return Results.Json(ApiResponse<object>.Fail("This prescription has expired and cannot be dispensed.", "PRESCRIPTION_EXPIRED"),
                    statusCode: StatusCodes.Status410Gone);
            }

            // Optimistic lock
            attestation.Status = "DISPENSED";
            attestation.IsAlreadyDispensed = true;
            attestation.DispenseStatus = "DispensedExternally";
            attestation.DispensedPharmacyName = pharmacyName;
            attestation.DispensedAtUtc = DateTime.UtcNow;

            targetFacilityId = attestation.FacilityId;
            targetTenantId = attestation.TenantId.ToString();
            prescriptionId = attestation.SourceDocumentId;
            prescriptionNumber = attestation.DocumentNumber;

            await context.SaveChangesAsync(ct);
        }
        else if (cleanToken.Length >= 33 && cleanToken[32] == '.' && Guid.TryParseExact(cleanToken[..32], "N", out var parsedClinicId))
        {
            var facility = await context.Facilities.AsNoTracking()
                .FirstOrDefaultAsync(f => f.Id == parsedClinicId && !f.IsDeleted && f.FacilityType == FacilityType.Clinic && f.Status == FacilityStatus.Active, ct);

            if (facility == null)
            {
                return Results.NotFound(ApiResponse<object>.Fail("Prescription not found.", "NOT_FOUND"));
            }

            targetFacilityId = facility.Id;
            targetTenantId = facility.TenantId.ToString();
            prescriptionId = Guid.NewGuid();
        }
        else
        {
            return Results.NotFound(ApiResponse<object>.Fail("Prescription not found.", "NOT_FOUND"));
        }

        string? payloadBase64 = receiptBase64;
        if (receiptBytes != null && receiptBytes.Length > 0)
        {
            var mime = string.IsNullOrWhiteSpace(receiptContentType) ? "application/pdf" : receiptContentType;
            payloadBase64 = $"data:{mime};base64,{Convert.ToBase64String(receiptBytes)}";
        }

        var correlationId = prescriptionId != Guid.Empty ? prescriptionId : Guid.NewGuid();
        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = prescriptionId,
            PrescriptionNumber = prescriptionNumber,
            ExternalPharmacyName = pharmacyName,
            ExternalBranchLocation = branchLocation,
            PharmacistName = pharmacistName,
            PharmacistPrcLicense = pharmacistPrcLicense,
            OfficialReceiptNumber = receiptNumber,
            ReceiptDocumentBase64 = payloadBase64,
            ReceiptFileName = receiptFileName,
            ReceiptContentType = receiptContentType,
            Notes = notes,
            DispensedAt = DateTime.UtcNow,
            VerificationToken = cleanToken
        };

        publisher.Enqueue(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(targetTenantId, targetFacilityId.ToString(), FacilityType.Clinic),
            correlationId,
            dispenseEvent);

        await context.SaveChangesAsync(ct);

        logger.LogInformation("Prescription dispense successfully enqueued to clinic facility {FacilityId} with correlation {CorrelationId}.",
            targetFacilityId, correlationId);

        return Results.Accepted(value: ApiResponse<object>.Success(new
        {
            Accepted = true,
            PrescriptionNumber = prescriptionNumber,
            Message = "Prescription dispense relayed to issuing clinic."
        }));
    }

    private static string ComputeTokenHash(string token)
    {
        using var sha256 = SHA256.Create();
        var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static bool ValidateReceiptFileType(string? contentType, byte[] data)
    {
        if (data.Length < 4) return false;

        // PDF check: %PDF
        if (data[0] == 0x25 && data[1] == 0x50 && data[2] == 0x44 && data[3] == 0x46)
            return true;

        // JPEG check: 0xFF, 0xD8, 0xFF
        if (data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF)
            return true;

        // PNG check: 0x89, 0x50, 0x4E, 0x47
        if (data.Length >= 8 &&
            data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 &&
            data[4] == 0x0D && data[5] == 0x0A && data[6] == 0x1A && data[7] == 0x0A)
            return true;

        return false;
    }
}
