using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.PublicUploads;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed record LabUploadValidationInfo(
    bool IsValid,
    string ClinicName,
    string? ClinicAddress,
    string? ClinicContact);

/// <summary>
/// Endpoint external labs use to validate their upload link and upload a result file for the issuing clinic.
/// Strictly enforces token format, active clinic verification, and kind differentiation (e.g. rejects Rx tokens).
/// </summary>
public sealed class PublicLabUploadEndpoints : IEndpoint
{
    public const string RateLimitPolicy = "lab-upload-relay";

    /// <summary>Room for multipart boundaries and the optional lab-name field on top of the file itself.</summary>
    private const int MultipartOverheadBytes = 64 * 1024;

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/public/lab-uploads/{token}", ValidateLabUploadTokenAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicy)
            .WithName("ValidateLabUploadToken")
            .WithTags("Public");

        app.MapGet("/public/lab-uploads/{token}/info", ValidateLabUploadTokenAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicy)
            .WithName("ValidateLabUploadTokenInfo")
            .WithTags("Public");

        app.MapPost("/public/lab-uploads/{token}", async (
            string token,
            HttpContext httpContext,
            ISender sender,
            IOptions<LabUploadOptions> options,
            IApplicationDbContext context,
            CancellationToken ct) =>
        {
            var (isValid, facility, errorMessage) = await ValidateTokenInternalAsync(token, context, ct);
            if (!isValid)
            {
                return Results.NotFound(ApiResponse<object>.Fail(
                    errorMessage ?? "Invalid or unrecognized laboratory upload token.",
                    "NOT_FOUND"));
            }

            var limits = options.Value;
            var bodyLimit = (long)limits.MaxFileBytes + MultipartOverheadBytes;

            var sizeFeature = httpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
            if (sizeFeature is { IsReadOnly: false }) sizeFeature.MaxRequestBodySize = bodyLimit;

            if (httpContext.Request.ContentLength > bodyLimit) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            if (!httpContext.Request.HasFormContentType) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);

            IFormCollection form;
            try
            {
                form = await httpContext.Request.ReadFormAsync(ct);
            }
            catch (Exception ex) when (ex is BadHttpRequestException or InvalidDataException)
            {
                return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            }

            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0) return Results.BadRequest(new { Message = "Attach the result file." });
            if (file.Length > limits.MaxFileBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

            using var buffer = new MemoryStream((int)file.Length);
            await using (var stream = file.OpenReadStream())
            {
                await stream.CopyToAsync(buffer, ct);
            }
            var content = buffer.ToArray();

            var verdict = LabUploadValidator.Validate(limits, file.ContentType, content);
            switch (verdict)
            {
                case LabUploadVerdict.UnsupportedType:
                    return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
                case LabUploadVerdict.TooLarge:
                    return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
                case LabUploadVerdict.EmptyFile or LabUploadVerdict.ContentMismatch:
                    return Results.BadRequest(new { Message = "The file is empty or does not match its type." });
            }

            await sender.Send(new RelayExternalLabUploadCommand(token, file.FileName, file.ContentType, content, form["labName"].ToString()), ct);

            return Results.Accepted(value: new { Accepted = true });
        })
        .AllowAnonymous()
        .DisableAntiforgery()
        .RequireRateLimiting(RateLimitPolicy)
        .WithName("RelayExternalLabUpload")
        .WithDescription("Anonymous, rate limited. Multipart upload (field 'file', optional 'labName') of a lab result for the clinic that issued the token. Strict size and content-type limits; nothing is stored here.")
        .WithTags("Public");
    }

    public static async Task<IResult> ValidateLabUploadTokenAsync(
        string token,
        IApplicationDbContext context,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return Results.BadRequest(ApiResponse<LabUploadValidationInfo>.Fail("Upload token is required.", "REQUIRED_FIELD_MISSING"));
        }

        var (isValid, facility, errorMessage) = await ValidateTokenInternalAsync(token, context, ct);
        if (!isValid)
        {
            return Results.NotFound(ApiResponse<LabUploadValidationInfo>.Fail(
                errorMessage ?? "Invalid or unrecognized laboratory upload token.",
                "NOT_FOUND"));
        }

        var info = new LabUploadValidationInfo(
            IsValid: true,
            ClinicName: facility!.Name,
            ClinicAddress: facility.StreetAddress,
            ClinicContact: facility.ContactNumber);

        return Results.Ok(ApiResponse<LabUploadValidationInfo>.Success(info));
    }

    public static async Task<(bool IsValid, Facility? Facility, string? ErrorMessage)> ValidateTokenInternalAsync(
        string? token,
        IApplicationDbContext context,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 200)
        {
            return (false, null, "Invalid or malformed laboratory upload token.");
        }

        var cleanToken = token.Trim();

        // 1. Kind mismatch checks: Reject non-lab document prefixes
        if (cleanToken.StartsWith("rx-", StringComparison.OrdinalIgnoreCase) ||
            cleanToken.StartsWith("mc-", StringComparison.OrdinalIgnoreCase) ||
            cleanToken.StartsWith("ref-", StringComparison.OrdinalIgnoreCase) ||
            cleanToken.StartsWith("sec-sha256-", StringComparison.OrdinalIgnoreCase))
        {
            return (false, null, "The provided token is for a clinical document, not a laboratory upload.");
        }

        // 2. Rx verification token rejection: {clinicId:N}.{secretGuid:N} (65 characters, 32 hex chars secret)
        if (cleanToken.Length == 65 && cleanToken[32] == '.' &&
            Guid.TryParseExact(cleanToken[..32], "N", out _) &&
            Guid.TryParseExact(cleanToken[33..], "N", out _))
        {
            return (false, null, "The provided token is an e-prescription verification token, not a laboratory upload token.");
        }

        // 3. DocumentAttestation cross-check: Reject if matching an Rx or other non-lab document
        using var sha256 = SHA256.Create();
        var tokenHash = Convert.ToHexString(sha256.ComputeHash(Encoding.UTF8.GetBytes(cleanToken.ToLowerInvariant()))).ToLowerInvariant();

        var attestation = await context.DocumentAttestations.AsNoTracking()
            .FirstOrDefaultAsync(d => d.VerificationTokenHash == tokenHash ||
                                      d.SecurityDigest == cleanToken ||
                                      d.DocumentNumber == cleanToken, ct);

        if (attestation != null && attestation.DocumentKind != "lab-order" && attestation.DocumentKind != "lab-report")
        {
            return (false, null, $"The provided token belongs to a {attestation.DocumentKind} document, not a laboratory upload.");
        }

        // 4. Lab upload token structure check: {facilityId:N}.{secret}
        var facilityId = RelayExternalLabUploadCommandHandler.ParseFacilityId(cleanToken);
        if (facilityId is null)
        {
            return (false, null, "Invalid or malformed laboratory upload token.");
        }

        // 5. Facility verification: Must be active, routable Clinic
        var facility = await context.Facilities.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == facilityId.Value && !f.IsDeleted, ct);

        if (facility is null
            || facility.FacilityType != FacilityType.Clinic
            || facility.Status != FacilityStatus.Active
            || !FacilityCells.IsRoutable(facility))
        {
            return (false, null, "The clinic associated with this laboratory upload token is inactive or not found.");
        }

        return (true, facility, null);
    }
}
