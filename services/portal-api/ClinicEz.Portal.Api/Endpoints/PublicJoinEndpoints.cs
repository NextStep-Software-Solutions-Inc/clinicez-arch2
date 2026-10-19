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

/// <summary>
/// Anonymous endpoint for public patient self-intake registration.
/// Verifies facility routing viability, issues cryptographically signed claim tokens,
/// transactionally enqueues the <see cref="InteropTypes.PatientJoinRequested"/> envelope
/// to the target clinic facility, and conditionally dispatches <see cref="InteropTypes.NotificationEmailRequested"/>
/// for progressive account claiming (strictly 0 SMS).
/// </summary>
public sealed class PublicJoinEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/public/join", HandleAsync)
            .AllowAnonymous()
            .DisableAntiforgery()
            .RequireRateLimiting("PublicApi")
            .WithName("RelayPublicPatientJoin")
            .WithDescription("Public, unauthenticated patient self-intake endpoint. Verifies routing viability, issues claim token, and enqueues envelope to clinic facility.")
            .WithTags("PublicJoin");
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

        // PhilHealth PIN validation if provided
        if (!string.IsNullOrWhiteSpace(payload.PhilHealthPin))
        {
            if (!PhilHealthMod11Validator.Validate(payload.PhilHealthPin))
            {
                return Results.BadRequest(new { Success = false, Message = "Invalid PhilHealth PIN check digit." });
            }
        }

        // Dependent statutory verification
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

        // Attachments limits & size check
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
            .FirstOrDefaultAsync(f => f.TenantId == tenant.Id && f.Slug.ToLower() == normalizedFacilitySlug, ct);

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

        // 4. Enqueue Interop Envelopes
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
                logger.LogWarning("Account claim email for join request {TrackingId} skipped: frontend address could not be resolved (set FrontendBaseUrl or Facility:BaseDomain).", trackingId);
            }
            else
            {
                var claimUrl = $"{baseUrl}/join/claim?token={Uri.EscapeDataString(claimToken)}";

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
