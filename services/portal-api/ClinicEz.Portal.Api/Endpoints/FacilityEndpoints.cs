using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Features.Hub;
using System;
using System.Net.Http;
using System.Security.Claims;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Application.Features.Entitlements;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            Console.WriteLine($"[API] Creating facility '{command.Name}' of type {command.FacilityType} for tenant {command.TenantId}");
            try
            {
                var result = await sender.Send(command);
                return result.Success
                    ? Results.Ok(new
                    {
                        Success = true,
                        Message = "Facility created and provisioning event published",
                        result.HubCredentials,
                        result.HubOnboardingPending
                    })
                    : Results.BadRequest(new { Message = "Failed to create facility. Verify tenant details and names." });
            }
            catch (InvalidOperationException ex) when (ex is not EntitlementException)
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
            var isStaff = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == MemberStatus.Active);

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
            var isStaff = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == MemberStatus.Active);

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
                tenant.TenantSlug,
                facility.ConsoleBaseUrl);

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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin) return Results.Forbid();

            try
            {
                var success = await sender.Send(new UpdateFacilityCommand(id, tenant.TenantSlug, request.Name, request.Status, request.Slug));
                return success ? Results.Ok(new { Success = true }) : Results.NotFound(new { Message = "Facility not found." });
            }
            catch (InvalidOperationException ex) when (ex is not EntitlementException)
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
            ClinicEz.Portal.Application.Features.Admin.Services.IFacilityProvisioningPublisher provisioningPublisher,
            ClinicEz.Portal.Application.Features.Entitlements.IEntitlementService entitlements,
            ClinicEz.Portal.Application.Features.Licensing.IFacilityAllocationService allocations,
            ClinicEz.Portal.Application.Features.Licensing.ILicenseIssuer licenseIssuer,
            IConfiguration configuration,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin) return Results.Forbid();

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenant.Id);
            if (facility == null) return Results.NotFound(new { Message = "Facility not found." });

            facility.Status = ClinicEz.Portal.Domain.Entities.FacilityStatus.Active;
            facility.UpdatedAt = DateTime.UtcNow;

            var snapshot = await entitlements.ResolveAsync(tenant.Id, ct);
            var shares = await allocations.ComputeSharesAsync(tenant.Id, snapshot, facility.Id, ct);
            var license = licenseIssuer.Issue(tenant, facility, snapshot, shares[facility.Id]);
            var limits = license.Payload.Limits;
            var planTier = snapshot.PlanSlug;
            var expiresAt = license.Payload.ExpiresAtUtc!.Value;
            var licenseToken = license.Token;

            facility.LicenseToken = licenseToken;
            facility.PlanTier = planTier;
            facility.MaxStaffLimit = limits.MaxStaff;
            facility.LicenseExpiresAt = expiresAt;

            var slug = !string.IsNullOrWhiteSpace(facility.Slug)
                ? facility.Slug
                : GetFacilitiesQueryHandler.GenerateFacilitySlug(facility.Name);
            var consoleUrl = GetFacilitiesQueryHandler.ResolveConsoleUrl(configuration, facility.FacilityType, facility.Status, facility.Id, slug, tenant.TenantSlug, facility.ConsoleBaseUrl);

            provisioningPublisher.EnqueueLicenseIssued(new FacilityCreatedEvent
            {
                TenantId = tenant.Id.ToString(),
                TenantSlug = tenant.TenantSlug,
                FacilityType = facility.FacilityType,
                ResourceId = facility.Id,
                Name = facility.Name,
                Slug = slug,
                LicenseToken = licenseToken,
                Limits = limits,
                PlanTier = planTier,
                LicenseExpiresAt = expiresAt,
                ConsoleUrl = consoleUrl
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

        // 6a. Rotate (or first issue) one hub client of an on-premise workspace: ?service= is cell|clinic|laboratory|pharmacy|organization|billing, default the facility's own service
        app.MapPost("/facilities/{id:guid}/hub-credentials/rotate", async (
            Guid id,
            string tenantSlug,
            string? service,
            HttpContext httpContext,
            IApplicationDbContext context,
            IHubOnboardingService hubOnboarding,
            ILogger<FacilityEndpoints> logger) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin) return Results.Forbid();

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenant.Id);
            if (facility == null) return Results.NotFound(new { Message = "Facility not found." });

            try
            {
                var credentials = await hubOnboarding.RotateAsync(facility, tenant, service, httpContext.RequestAborted);
                return Results.Ok(new { Success = true, HubCredentials = credentials });
            }
            catch (InvalidOperationException ex) when (ex is not EntitlementException)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "Hub credential rotation for facility {FacilityId} failed.", facility.Id);
                return Results.Json(new { Message = "The hub could not be reached. Try again shortly." }, statusCode: StatusCodes.Status502BadGateway);
            }
        })
        .RequireAuthorization()
        .WithName("RotateFacilityHubCredentials")
        .WithDescription("Issues a new secret for one hub client of an on-premise workspace, selected by the service query parameter (cell, clinic, laboratory, pharmacy, organization, billing; default the facility's own service). The old secret stops working and the new one is returned once.")
        .WithTags("Facilities");

        // 6b. Export or fetch facility license key for offline / on-premise installation
        app.MapGet("/facilities/{id:guid}/license-key", async (
            Guid id,
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            ClinicEz.Portal.Application.Features.Entitlements.IEntitlementService entitlements,
            ClinicEz.Portal.Application.Features.Licensing.IFacilityAllocationService allocations,
            ClinicEz.Portal.Application.Features.Licensing.ILicenseIssuer licenseIssuer,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin) return Results.Forbid();

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenant.Id);
            if (facility == null) return Results.NotFound(new { Message = "Facility not found." });

            var snapshot = await entitlements.ResolveAsync(tenant.Id, ct);
            var shares = await allocations.ComputeSharesAsync(tenant.Id, snapshot, facility.Id, ct);
            var license = licenseIssuer.Issue(tenant, facility, snapshot, shares[facility.Id]);

            if (string.IsNullOrWhiteSpace(facility.LicenseToken))
            {
                facility.LicenseToken = license.Token;
                facility.PlanTier = snapshot.PlanSlug;
                facility.MaxStaffLimit = license.Payload.Limits.MaxStaff;
                facility.LicenseExpiresAt = license.Payload.ExpiresAtUtc;
                await context.SaveChangesAsync(ct);
            }

            return Results.Ok(new
            {
                FacilityId = facility.Id,
                FacilityName = facility.Name,
                FacilityType = facility.FacilityType.ToString(),
                PlanTier = facility.PlanTier,
                LicenseToken = facility.LicenseToken,
                Limits = license.Payload.Limits,
                ExpiresAt = facility.LicenseExpiresAt
            });
        })
        .RequireAuthorization()
        .WithName("GetFacilityLicenseKey")
        .WithDescription("Retrieves the cryptographically signed facility license key for offline or on-premise installation.")
        .WithTags("Facilities");

        // 7. Update facility settings (regulatory profile, notifications)
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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == MemberStatus.Active &&
                (s.Role == WorkspaceMemberRole.Admin || context.StaffMembers.Any(p => p.WorkspaceMemberId == s.Id && p.Role == "Facility Administrator")));

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
            if (request.NotificationPreferencesJson != null) facility.NotificationPreferencesJson = request.NotificationPreferencesJson;
            facility.UpdatedAt = DateTime.UtcNow;

            await context.SaveChangesAsync(default);
            return Results.Ok(new { Success = true, Message = "Facility settings saved successfully." });
        })
        .RequireAuthorization()
        .WithName("UpdateFacilitySettings")
        .WithDescription("Updates facility regulatory profile and notification preferences.")
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
    string? NotificationPreferencesJson = null
);
