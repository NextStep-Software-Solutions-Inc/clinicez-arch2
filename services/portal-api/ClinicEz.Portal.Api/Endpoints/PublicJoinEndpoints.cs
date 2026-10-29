using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Security.ClaimTokens;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed record PublicFacilityJoinData(
    bool IsValid,
    string TenantSlug,
    string TenantName,
    string FacilitySlug,
    string FacilityName,
    string? FacilityAddress,
    string? OperatingHours,
    DateTime? ExpiresAt
);

public sealed class PublicJoinEndpoints : IEndpoint
{
    public const string RateLimitPolicy = "PublicApi";

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/public/join")
            .AllowAnonymous()
            .DisableAntiforgery()
            .RequireRateLimiting(RateLimitPolicy)
            .WithTags("PublicJoin");

        group.MapGet("/validate/{code}", ValidateJoinCodeAsync)
            .WithName("ValidateJoinCode")
            .WithDescription("Validates an alphanumeric clinic join code, enforcing active intake status, expiration, and multi-tenant collision guards.");

        group.MapGet("/facility/{tenantSlug}/{facilitySlug}", GetFacilityJoinDataAsync)
            .WithName("GetFacilityJoinData")
            .WithDescription("Retrieves public facility join metadata by tenant and facility slug.");

        group.MapPost("", HandleAsync)
            .WithName("RelayPublicPatientJoin")
            .WithDescription("Public, unauthenticated patient self-intake endpoint. Verifies routing viability, issues claim token, and enqueues envelope to clinic facility.");
    }

    public static async Task<IResult> ValidateJoinCodeAsync(
        string code,
        IApplicationDbContext context,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return Results.BadRequest(ApiResponse<PublicFacilityJoinData>.Fail("Join code is required.", "REQUIRED_FIELD_MISSING"));
        }

        var normalizedCode = code.Trim().ToUpperInvariant();
        var facilities = await context.Facilities.AsNoTracking()
            .Include(f => f.Tenant)
            .Where(f => !f.IsDeleted && f.JoinCode != null && f.JoinCode.ToUpper() == normalizedCode)
            .ToListAsync(ct);

        if (facilities.Count == 0)
        {
            return Results.NotFound(ApiResponse<PublicFacilityJoinData>.Fail("Invalid clinic join code.", "NOT_FOUND"));
        }

        if (facilities.Select(f => f.TenantId).Distinct().Count() > 1)
        {
            return Results.Conflict(ApiResponse<PublicFacilityJoinData>.Fail(
                "Join code matches multiple organizations. Please use the facility-specific QR code or link.",
                "JOIN_CODE_AMBIGUOUS"));
        }

        var facility = facilities[0];
        if (!facility.IsJoinEnabled)
        {
            return Results.Json(ApiResponse<PublicFacilityJoinData>.Fail(
                "Clinic self-registration is currently disabled.", "JOIN_DISABLED"),
                statusCode: StatusCodes.Status403Forbidden);
        }

        if (facility.JoinCodeExpiresAtUtc.HasValue && facility.JoinCodeExpiresAtUtc.Value < DateTime.UtcNow)
        {
            return Results.Json(ApiResponse<PublicFacilityJoinData>.Fail(
                "This clinic join code has expired. Please ask clinic reception for a new code.", "JOIN_CODE_EXPIRED"),
                statusCode: StatusCodes.Status410Gone);
        }

        var data = new PublicFacilityJoinData(
            IsValid: true,
            TenantSlug: facility.Tenant.TenantSlug,
            TenantName: facility.Tenant.Name,
            FacilitySlug: facility.Slug,
            FacilityName: facility.Name,
            FacilityAddress: facility.StreetAddress,
            OperatingHours: facility.OperatingHours,
            ExpiresAt: facility.JoinCodeExpiresAtUtc
        );

        return Results.Ok(ApiResponse<PublicFacilityJoinData>.Success(data, "Join code verified successfully."));
    }

    public static async Task<IResult> GetFacilityJoinDataAsync(
        string tenantSlug,
        string facilitySlug,
        IApplicationDbContext context,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenantSlug) || string.IsNullOrWhiteSpace(facilitySlug))
        {
            return Results.BadRequest(ApiResponse<PublicFacilityJoinData>.Fail("Tenant slug and facility slug are required.", "REQUIRED_FIELD_MISSING"));
        }

        var normalizedTenant = tenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == normalizedTenant && t.ArchivedAt == null, ct);

        if (tenant == null)
        {
            return Results.NotFound(ApiResponse<PublicFacilityJoinData>.Fail($"Tenant '{tenantSlug}' not found.", "NOT_FOUND"));
        }

        var normalizedFacility = facilitySlug.Trim().ToLowerInvariant();
        var facility = await context.Facilities.AsNoTracking()
            .FirstOrDefaultAsync(f => f.TenantId == tenant.Id && f.Slug.ToLower() == normalizedFacility && !f.IsDeleted, ct);

        if (facility == null)
        {
            return Results.NotFound(ApiResponse<PublicFacilityJoinData>.Fail($"Facility '{facilitySlug}' not found under tenant '{tenantSlug}'.", "NOT_FOUND"));
        }

        if (!facility.IsJoinEnabled)
        {
            return Results.Json(ApiResponse<PublicFacilityJoinData>.Fail(
                "Patient self-registration is currently disabled for this clinic.", "JOIN_DISABLED"),
                statusCode: StatusCodes.Status403Forbidden);
        }

        if (facility.JoinCodeExpiresAtUtc.HasValue && facility.JoinCodeExpiresAtUtc.Value < DateTime.UtcNow)
        {
            return Results.Json(ApiResponse<PublicFacilityJoinData>.Fail(
                "This clinic's registration intake has expired.", "JOIN_CODE_EXPIRED"),
                statusCode: StatusCodes.Status410Gone);
        }

        var data = new PublicFacilityJoinData(
            IsValid: true,
            TenantSlug: tenant.TenantSlug,
            TenantName: tenant.Name,
            FacilitySlug: facility.Slug,
            FacilityName: facility.Name,
            FacilityAddress: facility.StreetAddress,
            OperatingHours: facility.OperatingHours,
            ExpiresAt: facility.JoinCodeExpiresAtUtc
        );

        return Results.Ok(ApiResponse<PublicFacilityJoinData>.Success(data));
    }

    public static async Task<IResult> HandleAsync(
        PatientJoinRequestedPayload payload,
        IApplicationDbContext context,
        IInteropPublisher publisher,
        ISystemSettingsService settingsService,
        IFrontendUrlProvider frontendUrlProvider,
        ILogger<PublicJoinEndpoints> logger,
        IClaimTokenService? claimTokenService = null,
        IConfiguration? configuration = null,
        IHostEnvironment? hostEnvironment = null,
        CancellationToken ct = default)
    {
        // 1. Input Validation
        if (string.IsNullOrWhiteSpace(payload.TenantSlug) ||
            string.IsNullOrWhiteSpace(payload.FacilitySlug) ||
            string.IsNullOrWhiteSpace(payload.FirstName) ||
            string.IsNullOrWhiteSpace(payload.LastName) ||
            string.IsNullOrWhiteSpace(payload.ContactNumber) ||
            string.IsNullOrWhiteSpace(payload.Sex))
        {
            return Results.BadRequest(new { Success = false, Message = "Missing required patient demographic or routing fields." });
        }

        if (payload.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow))
        {
            return Results.BadRequest(new { Success = false, Message = "Date of birth cannot be in the future." });
        }

        if (!string.IsNullOrWhiteSpace(payload.PhilHealthPin))
        {
            if (!PhilHealthMod11Validator.Validate(payload.PhilHealthPin))
            {
                return Results.BadRequest(new { Success = false, Message = "Invalid PhilHealth PIN check digit." });
            }
        }

        if (string.Equals(payload.MemberType, "DD", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(payload.PrincipalMemberPin) ||
                !PhilHealthMod11Validator.Validate(payload.PrincipalMemberPin))
            {
                return Results.BadRequest(new { Success = false, Message = "Principal PhilHealth PIN is required and must have a valid Mod-11 check digit for dependents (DD)." });
            }

            if (string.IsNullOrWhiteSpace(payload.PrincipalFullName))
            {
                return Results.BadRequest(new { Success = false, Message = "Principal member full name is required for dependents (DD)." });
            }

            if (string.IsNullOrWhiteSpace(payload.PrincipalRelationship) ||
                !new[] { "C", "S", "P", "D" }.Contains(payload.PrincipalRelationship.Trim().ToUpperInvariant()))
            {
                return Results.BadRequest(new { Success = false, Message = "Principal relationship must be one of: 'C', 'S', 'P', 'D'." });
            }
        }

        if (!string.IsNullOrWhiteSpace(payload.RegionPsgc) && (payload.RegionPsgc.Length != 10 || !payload.RegionPsgc.All(char.IsDigit)))
        {
            return Results.BadRequest(new { Success = false, Message = "Region PSGC code must be a 10-digit numeric string." });
        }

        if (!string.IsNullOrWhiteSpace(payload.ProvincePsgc) && (payload.ProvincePsgc.Length != 10 || !payload.ProvincePsgc.All(char.IsDigit)))
        {
            return Results.BadRequest(new { Success = false, Message = "Province PSGC code must be a 10-digit numeric string." });
        }

        if (!string.IsNullOrWhiteSpace(payload.CityMunicipalityPsgc) && (payload.CityMunicipalityPsgc.Length != 10 || !payload.CityMunicipalityPsgc.All(char.IsDigit)))
        {
            return Results.BadRequest(new { Success = false, Message = "City / Municipality PSGC code must be a 10-digit numeric string." });
        }

        if (!string.IsNullOrWhiteSpace(payload.BarangayPsgc) && (payload.BarangayPsgc.Length != 10 || !payload.BarangayPsgc.All(char.IsDigit)))
        {
            return Results.BadRequest(new { Success = false, Message = "Barangay PSGC code must be a 10-digit numeric string." });
        }

        if (payload.Attachments != null && payload.Attachments.Count > 0)
        {
            if (payload.Attachments.Count > 5)
            {
                return Results.BadRequest(new { Success = false, Message = "Maximum of 5 outside attachments allowed per submission." });
            }

            foreach (var att in payload.Attachments)
            {
                if (att.FileSizeBytes > 10 * 1024 * 1024)
                {
                    return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
                }
            }
        }

        // 2. Tenant and Facility Resolution
        var normalizedTenantSlug = payload.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == normalizedTenantSlug && t.ArchivedAt == null, ct);

        if (tenant == null)
        {
            return Results.NotFound(new { Success = false, Message = $"Tenant '{payload.TenantSlug}' not found or is archived." });
        }

        var normalizedFacilitySlug = payload.FacilitySlug.Trim().ToLowerInvariant();
        var facility = await context.Facilities.AsNoTracking()
            .FirstOrDefaultAsync(f => f.TenantId == tenant.Id && f.Slug.ToLower() == normalizedFacilitySlug && !f.IsDeleted, ct);

        if (facility == null)
        {
            return Results.NotFound(new { Success = false, Message = $"Facility '{payload.FacilitySlug}' not found under tenant '{payload.TenantSlug}'." });
        }

        if (facility.FacilityType != FacilityType.Clinic)
        {
            return Results.BadRequest(new { Success = false, Message = $"Facility '{payload.FacilitySlug}' is not a clinic." });
        }

        if (facility.Status != FacilityStatus.Active || !FacilityCells.IsRoutable(facility))
        {
            logger.LogWarning("Rejecting public join relay: facility {FacilitySlug} has status {Status} and is unroutable.",
                facility.Slug, facility.Status);
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        if (!facility.IsJoinEnabled)
        {
            return Results.Json(new { Success = false, Message = "Patient self-registration is currently disabled for this clinic." }, statusCode: StatusCodes.Status403Forbidden);
        }

        if (facility.JoinCodeExpiresAtUtc.HasValue && facility.JoinCodeExpiresAtUtc.Value < DateTime.UtcNow)
        {
            return Results.Json(new { Success = false, Message = "This clinic join intake has expired." }, statusCode: StatusCodes.Status410Gone);
        }

        // 3. Resolve TTL and Issue Cryptographically Signed Claim Token
        var tokenService = claimTokenService ?? new ClaimTokenService(configuration: configuration, environment: hostEnvironment);
        var ttlHours = await settingsService.GetSettingIntAsync("JoinClaim:TtlHours", 48, ct);
        if (ttlHours <= 0) ttlHours = 48;
        var expiresAt = DateTime.UtcNow.AddHours(ttlHours);

        var trackingId = payload.JoinRequestId ?? Guid.NewGuid();
        var claimToken = tokenService.IssueToken(new ClaimTokenClaims(
            joinRequestId: trackingId,
            tenantSlug: tenant.TenantSlug,
            facilitySlug: facility.Slug,
            email: payload.Email,
            firstName: payload.FirstName,
            lastName: payload.LastName,
            dateOfBirth: payload.DateOfBirth,
            memberType: payload.MemberType,
            expiresAtUtc: expiresAt));

        // 4. Enqueue Interop Envelope to target clinic
        publisher.Enqueue(
            InteropTypes.PatientJoinRequested,
            Party.Portal,
            Party.ForFacility(facility.TenantId.ToString(), facility.Id.ToString(), FacilityType.Clinic),
            trackingId,
            payload);

        // 5. If Email is Provided, Enqueue notification.email.requested to Interop Hub (Strictly 0 SMS)
        if (!string.IsNullOrWhiteSpace(payload.Email))
        {
            var baseUrl = frontendUrlProvider.GetBaseUrl()?.TrimEnd('/');
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                logger.LogWarning("Account claim email for join request {TrackingId} skipped: frontend address could not be resolved.", trackingId);
            }
            else
            {
                var claimUrl = PublicRoutes.Claim(claimToken, baseUrl);

                publisher.Enqueue(
                    InteropTypes.NotificationEmailRequested,
                    Party.Portal,
                    Party.Portal,
                    trackingId,
                    new NotificationEmailRequestedPayload
                    {
                        To = payload.Email.Trim(),
                        Subject = $"Your Registration Pass & Account Claim Link - {facility.Name ?? facility.Slug}",
                        TemplateKey = EmailTemplateKeys.PatientClaimInvitation,
                        Model = new Dictionary<string, string>
                        {
                            ["patientName"] = $"{payload.FirstName} {payload.LastName}".Trim(),
                            ["facilityName"] = facility.Name ?? facility.Slug,
                            ["claimUrl"] = claimUrl,
                            ["ttlHours"] = ttlHours.ToString(),
                            ["expiresAt"] = expiresAt.ToString("yyyy-MM-dd HH:mm UTC")
                        },
                        FromFacilityName = facility.Name ?? tenant.Name
                    });
            }
        }

        await context.SaveChangesAsync(ct);

        logger.LogInformation("Public join request {TrackingId} successfully enqueued for clinic facility {FacilityId} ({FacilitySlug}).",
            trackingId, facility.Id, facility.Slug);

        return Results.Accepted(value: new
        {
            Success = true,
            TrackingId = trackingId,
            ClaimToken = claimToken,
            ExpiresAt = expiresAt,
            Message = "Patient join request accepted for clinic ingestion."
        });
    }
}
