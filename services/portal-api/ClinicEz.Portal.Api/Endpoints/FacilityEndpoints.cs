using ClinicEz.Portal.Application.Features.Admin.Queries;
using System;
using System.Security.Claims;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using ClinicEz.Shared.Licensing;

namespace ClinicEz.Portal.Api.Endpoints;

public class FacilityEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        // 1. Create a new institutional facility
        app.MapPost("/facilities", async (
            CreateFacilityCommand command,
            HttpContext httpContext,
            IApplicationDbContext context,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == command.TenantId.ToLower() || t.Id.ToString() == command.TenantId);

            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            Console.WriteLine($"[API] Creating facility '{command.Name}' of type {command.FacilityType} for tenant {command.TenantId}");
            try
            {
                var success = await sender.Send(command);
                return success 
                    ? Results.Ok(new { Success = true, Message = "Facility created and provisioning event published" }) 
                    : Results.BadRequest(new { Message = "Failed to create facility. Verify tenant details and names." });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("CreateFacility")
        .WithDescription("Creates a new institutional facility (clinic, lab, pharmacy, org) and triggers provisioning event in the monorepo.")
        .WithTags("Facilities");

        // 2. Retrieve facilities with environment-aware subdomain console URLs
        app.MapGet("/facilities", async (
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isStaff = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == "Active");

            if (!isOwner && !isStaff)
            {
                return Results.Forbid();
            }

            var facilities = await sender.Send(new GetFacilitiesQuery(tenantSlug));
            return Results.Ok(facilities);
        })
        .RequireAuthorization()
        .WithName("GetFacilities")
        .WithDescription("Retrieves all created facilities for a tenant with console URLs.")
        .WithTags("Facilities");

        // 3. Resolve subdomain console URL for a specific facility
        app.MapGet("/facilities/{id:guid}/console-url", async (
            Guid id,
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            IConfiguration configuration) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isStaff = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == "Active");

            if (!isOwner && !isStaff)
            {
                return Results.Forbid();
            }

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenant.Id);
            if (facility == null)
            {
                return Results.NotFound(new { Message = "Facility not found." });
            }

            var slug = !string.IsNullOrWhiteSpace(facility.Slug)
                ? facility.Slug
                : GetFacilitiesQueryHandler.GenerateFacilitySlug(facility.Name);

            var consoleUrl = GetFacilitiesQueryHandler.ResolveConsoleUrl(
                configuration,
                facility.FacilityType,
                facility.Status,
                facility.Id,
                slug,
                tenant.TenantSlug);

            return Results.Ok(new 
            { 
                Slug = slug, 
                ConsoleUrl = consoleUrl, 
                Status = facility.Status.ToString(),
                FacilityType = facility.FacilityType.ToString() 
            });
        })
        .RequireAuthorization()
        .WithName("GetFacilityConsoleUrl")
        .WithDescription("Resolves environment-aware subdomain console URL for a specific facility.")
        .WithTags("Facilities");

        // 3b. Check whether a facility subdomain slug is available
        app.MapGet("/facilities/check-slug/{slug}", async (
            string slug,
            IApplicationDbContext context,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(slug))
            {
                return Results.BadRequest(new { Available = false, Message = "Slug cannot be empty." });
            }

            var cleanSlug = GetFacilitiesQueryHandler.GenerateFacilitySlug(slug);
            if (cleanSlug.Length < 2 || cleanSlug.Length > 63)
            {
                return Results.Ok(new 
                { 
                    Available = false, 
                    Slug = cleanSlug, 
                    Message = "Slug must be between 2 and 63 alphanumeric or hyphen characters." 
                });
            }

            var exists = await context.Facilities.AnyAsync(f => 
                !f.IsDeleted && f.Slug.ToLower() == cleanSlug.ToLower(), 
                ct);

            return Results.Ok(new
            {
                Available = !exists,
                Slug = cleanSlug,
                Message = exists ? $"Subdomain slug '{cleanSlug}' is already taken." : "Slug is available."
            });
        })
        .WithName("CheckFacilitySlug")
        .WithDescription("Checks whether a facility subdomain slug is available.")
        .WithTags("Facilities")
        .AllowAnonymous();

        // 4. Update an existing facility
        app.MapPut("/facilities/{id:guid}", async (
            Guid id,
            UpdateFacilityRequest request,
            HttpContext httpContext,
            IApplicationDbContext context,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin) return Results.Forbid();

            try
            {
                var success = await sender.Send(new UpdateFacilityCommand(id, tenant.TenantSlug, request.Name, request.Status, request.Slug));
                return success ? Results.Ok(new { Success = true }) : Results.NotFound(new { Message = "Facility not found." });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("UpdateFacility")
        .WithDescription("Updates an existing facility name or operational status.")
        .WithTags("Facilities");

        // 5. Delete / archive a facility (Owner only)
        app.MapDelete("/facilities/{id:guid}", async (
            Guid id,
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            if (tenant.OwnerId != clerkUserId) return Results.Forbid();

            var success = await sender.Send(new DeleteFacilityCommand(id, tenant.TenantSlug));
            return success ? Results.Ok(new { Success = true }) : Results.NotFound(new { Message = "Facility not found." });
        })
        .RequireAuthorization()
        .WithName("DeleteFacility")
        .WithDescription("Permanently deletes/archives a facility from the workspace (Owner only).")
        .WithTags("Facilities");

        // 6. Force-activate a facility and re-publish provisioning event
        app.MapPost("/facilities/{id:guid}/activate", async (
            Guid id,
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            MassTransit.IPublishEndpoint publishEndpoint,
            IFacilityLicenseSigner licenseSigner) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin) return Results.Forbid();

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenant.Id);
            if (facility == null) return Results.NotFound(new { Message = "Facility not found." });

            var planTier = facility.PlanTier ?? "Community";
            var limits = PlanTierDefaults.GetLimitsForTier(planTier);
            var features = PlanTierDefaults.GetFeaturesForTier(planTier);
            var expiresAt = facility.LicenseExpiresAt ?? DateTime.UtcNow.AddYears(1);

            var payload = new FacilityLicensePayload
            {
                FacilityId = facility.Id,
                TenantId = tenant.Id.ToString(),
                TenantSlug = tenant.TenantSlug,
                FacilityName = facility.Name,
                FacilityType = facility.FacilityType.ToString(),
                PlanTier = planTier,
                Limits = limits,
                EnabledFeatures = features,
                IssuedAtUtc = DateTime.UtcNow,
                ExpiresAtUtc = expiresAt
            };

            var licenseToken = licenseSigner.SignLicense(payload);

            facility.LicenseToken = licenseToken;
            facility.MaxStaffLimit = limits.MaxStaff;
            facility.LicenseExpiresAt = expiresAt;
            facility.Status = ClinicEz.Portal.Domain.Entities.FacilityStatus.Active;
            facility.UpdatedAt = DateTime.UtcNow;

            await publishEndpoint.Publish(new FacilityCreatedEvent
            {
                TenantId = tenant.Id.ToString(),
                TenantSlug = tenant.TenantSlug,
                FacilityType = facility.FacilityType,
                ResourceId = facility.Id,
                Name = facility.Name,
                LicenseToken = licenseToken,
                Limits = limits,
                PlanTier = planTier,
                LicenseExpiresAt = expiresAt
            });

            await context.SaveChangesAsync(default);

            return Results.Ok(new
            {
                Success = true,
                Message = "Facility activated successfully.",
                LicenseToken = licenseToken,
                Limits = limits
            });
        })
        .RequireAuthorization()
        .WithName("ActivateFacility")
        .WithDescription("Activates a facility, mints a cryptographic license, and re-publishes the provisioning event.")
        .WithTags("Facilities");

        // 6b. Export or fetch facility license key for offline / on-premise installation
        app.MapGet("/facilities/{id:guid}/license-key", async (
            Guid id,
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            IFacilityLicenseSigner licenseSigner) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin) return Results.Forbid();

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenant.Id);
            if (facility == null) return Results.NotFound(new { Message = "Facility not found." });

            if (string.IsNullOrWhiteSpace(facility.LicenseToken))
            {
                var planTier = facility.PlanTier ?? "Community";
                var limits = PlanTierDefaults.GetLimitsForTier(planTier);
                var features = PlanTierDefaults.GetFeaturesForTier(planTier);
                var expiresAt = facility.LicenseExpiresAt ?? DateTime.UtcNow.AddYears(1);

                var payload = new FacilityLicensePayload
                {
                    FacilityId = facility.Id,
                    TenantId = tenant.Id.ToString(),
                    TenantSlug = tenant.TenantSlug,
                    FacilityName = facility.Name,
                    FacilityType = facility.FacilityType.ToString(),
                    PlanTier = planTier,
                    Limits = limits,
                    EnabledFeatures = features,
                    IssuedAtUtc = DateTime.UtcNow,
                    ExpiresAtUtc = expiresAt
                };

                facility.LicenseToken = licenseSigner.SignLicense(payload);
                facility.MaxStaffLimit = limits.MaxStaff;
                facility.LicenseExpiresAt = expiresAt;
                await context.SaveChangesAsync(default);
            }

            var activeLimits = PlanTierDefaults.GetLimitsForTier(facility.PlanTier);

            return Results.Ok(new
            {
                FacilityId = facility.Id,
                FacilityName = facility.Name,
                FacilityType = facility.FacilityType.ToString(),
                PlanTier = facility.PlanTier,
                LicenseToken = facility.LicenseToken,
                Limits = activeLimits,
                ExpiresAt = facility.LicenseExpiresAt
            });
        })
        .RequireAuthorization()
        .WithName("GetFacilityLicenseKey")
        .WithDescription("Retrieves the cryptographically signed facility license key for offline or on-premise installation.")
        .WithTags("Facilities");

        // 7. Update facility settings (regulatory profile, digital letterhead, medical stamp, notifications)
        app.MapPut("/facilities/{id:guid}/settings", async (
            Guid id,
            UpdateFacilitySettingsRequest request,
            HttpContext httpContext,
            IApplicationDbContext context) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && (s.Role == "Admin" || s.Role == "Facility Administrator") && s.Status == "Active");

            if (!isOwner && !isAdmin) return Results.Forbid();

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenant.Id);
            if (facility == null) return Results.NotFound(new { Message = "Facility not found." });

            if (!string.IsNullOrWhiteSpace(request.Name)) facility.Name = request.Name.Trim();

            if (!string.IsNullOrWhiteSpace(request.Slug))
            {
                var cleanSlug = GetFacilitiesQueryHandler.GenerateFacilitySlug(request.Slug);
                var slugExists = await context.Facilities.AnyAsync(f => 
                    f.Id != id && !f.IsDeleted && f.Slug.ToLower() == cleanSlug.ToLower());
                if (slugExists)
                {
                    return Results.BadRequest(new { Message = $"The facility slug '{cleanSlug}' is already taken. Please choose another unique subdomain slug." });
                }
                facility.Slug = cleanSlug;
            }

            if (request.Status.HasValue) facility.Status = request.Status.Value;
            if (request.Classification != null) facility.Classification = request.Classification;
            if (request.LicenseToOperate != null) facility.LicenseToOperate = request.LicenseToOperate;
            if (request.PhilHealthAccreditationNumber != null) facility.PhilHealthAccreditationNumber = request.PhilHealthAccreditationNumber;
            if (request.TaxIdentificationNumber != null) facility.TaxIdentificationNumber = request.TaxIdentificationNumber;
            if (request.OperatingHours != null) facility.OperatingHours = request.OperatingHours;
            if (request.Region != null) facility.Region = request.Region;
            if (request.Province != null) facility.Province = request.Province;
            if (request.City != null) facility.City = request.City;
            if (request.Barangay != null) facility.Barangay = request.Barangay;
            if (request.ZipCode != null) facility.ZipCode = request.ZipCode;
            if (request.StreetAddress != null) facility.StreetAddress = request.StreetAddress;
            if (request.ContactNumber != null) facility.ContactNumber = request.ContactNumber;
            if (request.ContactEmail != null) facility.ContactEmail = request.ContactEmail;
            if (request.LogoUrl != null) facility.LogoUrl = request.LogoUrl;
            if (request.LetterheadHeader != null) facility.LetterheadHeader = request.LetterheadHeader;
            if (request.LetterheadSubHeader != null) facility.LetterheadSubHeader = request.LetterheadSubHeader;
            if (request.LetterheadAddress != null) facility.LetterheadAddress = request.LetterheadAddress;
            if (request.LetterheadContact != null) facility.LetterheadContact = request.LetterheadContact;
            if (request.LetterheadFooter != null) facility.LetterheadFooter = request.LetterheadFooter;
            if (request.StampPhysicianName != null) facility.StampPhysicianName = request.StampPhysicianName;
            if (request.StampPrcLicense != null) facility.StampPrcLicense = request.StampPrcLicense;
            if (request.StampPtrNumber != null) facility.StampPtrNumber = request.StampPtrNumber;
            if (request.StampS2License != null) facility.StampS2License = request.StampS2License;
            if (request.NotificationPreferencesJson != null) facility.NotificationPreferencesJson = request.NotificationPreferencesJson;
            facility.UpdatedAt = DateTime.UtcNow;

            await context.SaveChangesAsync(default);
            return Results.Ok(new { Success = true, Message = "Facility settings saved successfully." });
        })
        .RequireAuthorization()
        .WithName("UpdateFacilitySettings")
        .WithDescription("Updates facility regulatory profile, digital letterhead, medical stamp, and notification preferences.")
        .WithTags("Facilities");
    }
}

public record UpdateFacilityRequest(string TenantSlug, string Name, ClinicEz.Portal.Domain.Entities.FacilityStatus? Status = null, string? Slug = null);

public record UpdateFacilitySettingsRequest(
    string TenantSlug,
    string? Name = null,
    string? Slug = null,
    ClinicEz.Portal.Domain.Entities.FacilityStatus? Status = null,
    string? Classification = null,
    string? LicenseToOperate = null,
    string? PhilHealthAccreditationNumber = null,
    string? TaxIdentificationNumber = null,
    string? OperatingHours = null,
    string? Region = null,
    string? Province = null,
    string? City = null,
    string? Barangay = null,
    string? ZipCode = null,
    string? StreetAddress = null,
    string? ContactNumber = null,
    string? ContactEmail = null,
    string? LogoUrl = null,
    string? LetterheadHeader = null,
    string? LetterheadSubHeader = null,
    string? LetterheadAddress = null,
    string? LetterheadContact = null,
    string? LetterheadFooter = null,
    string? StampPhysicianName = null,
    string? StampPrcLicense = null,
    string? StampPtrNumber = null,
    string? StampS2License = null,
    string? NotificationPreferencesJson = null
);
