using System.Security.Claims;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Branches;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.PhilHealth;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Api.Endpoints;

public record CreateBranchRequest(
    string TenantId,
    string Name,
    string? Code = null,
    string? StreetAddress = null,
    string? Barangay = null,
    string? City = null,
    string? Province = null,
    string? Region = null,
    string? ZipCode = null,
    string? ContactNumber = null,
    string? ContactEmail = null,
    List<Guid>? FacilityIds = null);

public record UpdateBranchRequest(
    string Name,
    string? Code = null,
    string? StreetAddress = null,
    string? Barangay = null,
    string? City = null,
    string? Province = null,
    string? Region = null,
    string? ZipCode = null,
    string? ContactNumber = null,
    string? ContactEmail = null,
    bool IsActive = true);

public record ConfigureBranchPhilHealthRequest(
    string AccreditationNumber,
    string? PmccNumber = null,
    string? SoftwareCertificateId = null,
    string? Username = null,
    string? Password = null,
    string? CipherKey = null,
    string? KonsultaEndpoint = null,
    bool IsPhilHealthAccredited = true);

public record TestBranchPhilHealthRequest(
    string? AccreditationNumber = null,
    string? PmccNumber = null,
    string? SoftwareCertificateId = null,
    string? Username = null,
    string? Password = null,
    string? CipherKey = null,
    string? KonsultaEndpoint = null);

public record BranchFacilitySummaryDto(
    Guid Id,
    string Name,
    string FacilityType,
    string Status);

public record BranchResponse(
    Guid Id,
    Guid TenantId,
    string Name,
    string? Code,
    bool IsActive,
    string? StreetAddress,
    string? Barangay,
    string? City,
    string? Province,
    string? Region,
    string? ZipCode,
    string? ContactNumber,
    string? ContactEmail,
    string? PhilHealthAccreditationNumber,
    string? PhilHealthPmccNumber,
    string? PhilHealthSoftwareCertificateId,
    string? PhilHealthKonsultaEndpoint,
    bool IsPhilHealthAccredited,
    List<BranchFacilitySummaryDto> Facilities);

public class BranchEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var branches = app.MapGroup("/branches").WithTags("Branches");

        // 1. Create a physical branch under a tenant
        branches.MapPost("", async (
            CreateBranchRequest request,
            HttpContext httpContext,
            IApplicationDbContext context,
            IEntitlementGuard entitlementGuard) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantId.ToLower() || t.Id.ToString() == request.TenantId);

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

            await entitlementGuard.EnsureCanCreateBranchAsync(tenant.Id);

            var branch = new Branch
            {
                Id = Guid.NewGuid(),
                TenantId = tenant.Id,
                Name = request.Name.Trim(),
                Code = request.Code?.Trim(),
                StreetAddress = request.StreetAddress,
                Barangay = request.Barangay,
                City = request.City,
                Province = request.Province,
                Region = request.Region,
                ZipCode = request.ZipCode,
                ContactNumber = request.ContactNumber,
                ContactEmail = request.ContactEmail,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = clerkUserId
            };

            context.Branches.Add(branch);

            // If facility IDs were specified, link them to this branch
            if (request.FacilityIds != null && request.FacilityIds.Count > 0)
            {
                var facilitiesToLink = await context.Facilities
                    .Where(f => f.TenantId == tenant.Id && request.FacilityIds.Contains(f.Id))
                    .ToListAsync();

                await BranchFacilityRules.EnsureCanLinkAsync(context, branch, facilitiesToLink, CancellationToken.None);

                foreach (var facility in facilitiesToLink)
                {
                    facility.BranchId = branch.Id;
                    facility.UpdatedAt = DateTime.UtcNow;
                    facility.UpdatedBy = clerkUserId;
                }
            }

            await context.SaveChangesAsync(CancellationToken.None);

            var summary = new BranchResponse(
                branch.Id,
                branch.TenantId,
                branch.Name,
                branch.Code,
                branch.IsActive,
                branch.StreetAddress,
                branch.Barangay,
                branch.City,
                branch.Province,
                branch.Region,
                branch.ZipCode,
                branch.ContactNumber,
                branch.ContactEmail,
                branch.PhilHealthAccreditationNumber,
                branch.PhilHealthPmccNumber,
                branch.PhilHealthSoftwareCertificateId,
                branch.PhilHealthKonsultaEndpoint,
                branch.IsPhilHealthAccredited,
                new List<BranchFacilitySummaryDto>());

            return Results.Created($"/api/v1/branches/{branch.Id}", ApiResponse<BranchResponse>.Success(summary));
        })
        .RequireAuthorization()
        .WithName("CreateBranch")
        .WithDescription("Creates a new physical branch / location under a tenant workspace.");

        // 2. List all branches for a tenant
        branches.MapGet("", async (
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context) =>
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

            // Auto-group legacy or unassigned facilities under a synthesized Main Branch
            var unassignedFacilities = await context.Facilities
                .Where(f => f.TenantId == tenant.Id && !f.IsDeleted && f.BranchId == null)
                .ToListAsync();

            if (unassignedFacilities.Count > 0)
            {
                var mainBranch = await context.Branches
                    .FirstOrDefaultAsync(b => b.TenantId == tenant.Id && !b.IsDeleted && (b.Code == "MAIN" || b.Name == "Main Branch"));

                if (mainBranch == null)
                {
                    mainBranch = new Branch
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenant.Id,
                        Name = string.IsNullOrWhiteSpace(tenant.Name) ? "Main Branch" : $"{tenant.Name} (Main Branch)",
                        Code = "MAIN",
                        StreetAddress = tenant.StreetLine1,
                        City = tenant.City,
                        Province = tenant.Province,
                        ZipCode = tenant.PostalCode,
                        ContactNumber = tenant.PhoneNumber,
                        ContactEmail = tenant.Email,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = clerkUserId
                    };
                    context.Branches.Add(mainBranch);
                    await context.SaveChangesAsync(CancellationToken.None);
                }

                var existingTypes = await context.Facilities
                    .Where(f => f.BranchId == mainBranch.Id && !f.IsDeleted)
                    .Select(f => f.FacilityType)
                    .ToListAsync();

                foreach (var fac in unassignedFacilities)
                {
                    if (!existingTypes.Contains(fac.FacilityType))
                    {
                        fac.BranchId = mainBranch.Id;
                        fac.UpdatedAt = DateTime.UtcNow;
                        fac.UpdatedBy = clerkUserId;
                        existingTypes.Add(fac.FacilityType);
                    }
                }

                await context.SaveChangesAsync(CancellationToken.None);
            }

            var list = await context.Branches
                .Where(b => b.TenantId == tenant.Id && !b.IsDeleted)
                .Include(b => b.Facilities)
                .OrderBy(b => b.Name)
                .Select(b => new BranchResponse(
                    b.Id,
                    b.TenantId,
                    b.Name,
                    b.Code,
                    b.IsActive,
                    b.StreetAddress,
                    b.Barangay,
                    b.City,
                    b.Province,
                    b.Region,
                    b.ZipCode,
                    b.ContactNumber,
                    b.ContactEmail,
                    b.PhilHealthAccreditationNumber,
                    b.PhilHealthPmccNumber,
                    b.PhilHealthSoftwareCertificateId,
                    b.PhilHealthKonsultaEndpoint,
                    b.IsPhilHealthAccredited,
                    b.Facilities.Where(f => !f.IsDeleted).Select(f => new BranchFacilitySummaryDto(
                        f.Id,
                        f.Name,
                        f.FacilityType.ToString(),
                        f.Status.ToString()
                    )).ToList()
                ))
                .ToListAsync();

            return Results.Ok(ApiResponse<List<BranchResponse>>.Success(list));
        })
        .RequireAuthorization()
        .WithName("GetBranches")
        .WithDescription("Retrieves all physical branches belonging to a tenant workspace.");

        // 3. Get single branch details by ID
        branches.MapGet("/{id:guid}", async (
            Guid id,
            HttpContext httpContext,
            IApplicationDbContext context) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var branch = await context.Branches
                .Include(b => b.Facilities)
                .FirstOrDefaultAsync(b => b.Id == id && !b.IsDeleted);

            if (branch == null)
            {
                return Results.NotFound(new { Message = "Branch not found." });
            }

            var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == branch.TenantId);
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

            var response = new BranchResponse(
                branch.Id,
                branch.TenantId,
                branch.Name,
                branch.Code,
                branch.IsActive,
                branch.StreetAddress,
                branch.Barangay,
                branch.City,
                branch.Province,
                branch.Region,
                branch.ZipCode,
                branch.ContactNumber,
                branch.ContactEmail,
                branch.PhilHealthAccreditationNumber,
                branch.PhilHealthPmccNumber,
                branch.PhilHealthSoftwareCertificateId,
                branch.PhilHealthKonsultaEndpoint,
                branch.IsPhilHealthAccredited,
                branch.Facilities.Where(f => !f.IsDeleted).Select(f => new BranchFacilitySummaryDto(
                    f.Id,
                    f.Name,
                    f.FacilityType.ToString(),
                    f.Status.ToString()
                )).ToList());

            return Results.Ok(ApiResponse<BranchResponse>.Success(response));
        })
        .RequireAuthorization()
        .WithName("GetBranchById")
        .WithDescription("Retrieves details of a branch by its unique identifier.");

        // 4. Update branch details
        branches.MapPut("/{id:guid}", async (
            Guid id,
            UpdateBranchRequest request,
            HttpContext httpContext,
            IApplicationDbContext context,
            ClinicEz.Portal.Application.Features.Admin.Services.IFacilityProvisioningPublisher provisioningPublisher,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var branch = await context.Branches
                .Include(b => b.Facilities)
                .FirstOrDefaultAsync(b => b.Id == id && !b.IsDeleted, ct);
            if (branch == null)
            {
                return Results.NotFound(new { Message = "Branch not found." });
            }

            var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == branch.TenantId, ct);
            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active, ct);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            branch.Name = request.Name.Trim();
            branch.Code = request.Code?.Trim();
            branch.StreetAddress = request.StreetAddress;
            branch.Barangay = request.Barangay;
            branch.City = request.City;
            branch.Province = request.Province;
            branch.Region = request.Region;
            branch.ZipCode = request.ZipCode;
            branch.ContactNumber = request.ContactNumber;
            branch.ContactEmail = request.ContactEmail;
            branch.IsActive = request.IsActive;
            branch.UpdatedAt = DateTime.UtcNow;
            branch.UpdatedBy = clerkUserId;

            foreach (var fac in branch.Facilities.Where(f => !f.IsDeleted))
            {
                fac.Branch = branch;
                await provisioningPublisher.StageDirectoryUpdateAsync(tenant, fac, ct);
            }

            await context.SaveChangesAsync(ct);

            return Results.Ok(ApiResponse<bool>.Success(true, "Branch updated successfully."));
        })
        .RequireAuthorization()
        .WithName("UpdateBranch")
        .WithDescription("Updates physical branch metadata and address.");

        // 5. Configure PhilHealth statutory credentials for a branch
        branches.MapPut("/{id:guid}/philhealth-config", async (
            Guid id,
            ConfigureBranchPhilHealthRequest request,
            HttpContext httpContext,
            IApplicationDbContext context,
            IPhilHealthSecretProtector protector,
            ClinicEz.Portal.Application.Features.Admin.Services.IFacilityProvisioningPublisher provisioningPublisher,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var branch = await context.Branches
                .Include(b => b.Facilities)
                .FirstOrDefaultAsync(b => b.Id == id && !b.IsDeleted, ct);
            if (branch == null)
            {
                return Results.NotFound(new { Message = "Branch not found." });
            }

            var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == branch.TenantId, ct);
            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active, ct);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            branch.PhilHealthAccreditationNumber = request.AccreditationNumber?.Trim();
            branch.PhilHealthPmccNumber = request.PmccNumber?.Trim();
            branch.PhilHealthSoftwareCertificateId = request.SoftwareCertificateId?.Trim();
            branch.PhilHealthKonsultaEndpoint = !string.IsNullOrWhiteSpace(request.KonsultaEndpoint)
                ? request.KonsultaEndpoint.Trim()
                : PhilHealthDefaults.KonsultaEndpoint;
            branch.IsPhilHealthAccredited = request.IsPhilHealthAccredited;

            if (!string.IsNullOrWhiteSpace(request.Username))
                branch.PhilHealthEncryptedUsername = protector.Protect(request.Username.Trim());

            if (!string.IsNullOrWhiteSpace(request.Password))
                branch.PhilHealthEncryptedPassword = protector.Protect(request.Password);

            if (!string.IsNullOrWhiteSpace(request.CipherKey))
                branch.PhilHealthEncryptedCipherKey = protector.Protect(request.CipherKey);

            branch.UpdatedAt = DateTime.UtcNow;
            branch.UpdatedBy = clerkUserId;

            foreach (var fac in branch.Facilities.Where(f => !f.IsDeleted))
            {
                fac.Branch = branch;
                await provisioningPublisher.StageDirectoryUpdateAsync(tenant, fac, ct);
            }

            await context.SaveChangesAsync(ct);

            return Results.Ok(ApiResponse<bool>.Success(true, "PhilHealth statutory credentials configured successfully."));
        })
        .RequireAuthorization()
        .WithName("ConfigureBranchPhilHealth")
        .WithDescription("Encrypted configuration of PhilHealth PMCC, software cert, and SOAP credentials on a branch.");

        // 5b. Test PhilHealth SOAP gateway connection for a branch before or after saving
        branches.MapPost("/{id:guid}/philhealth-test", async (
            Guid id,
            TestBranchPhilHealthRequest request,
            HttpContext httpContext,
            IApplicationDbContext context,
            IPhilHealthSecretProtector protector,
            IPhilHealthSoapTester soapTester,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var branch = await context.Branches.FirstOrDefaultAsync(b => b.Id == id && !b.IsDeleted, ct);
            if (branch == null)
            {
                return Results.NotFound(new { Message = "Branch not found." });
            }

            var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == branch.TenantId, ct);
            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active, ct);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            // Resolve values from request (in-flight before saving) or fallback to saved credentials
            var accreditationNumber = !string.IsNullOrWhiteSpace(request.AccreditationNumber)
                ? request.AccreditationNumber.Trim()
                : branch.PhilHealthAccreditationNumber;

            var pmccNumber = !string.IsNullOrWhiteSpace(request.PmccNumber)
                ? request.PmccNumber.Trim()
                : branch.PhilHealthPmccNumber;

            var softwareCertId = !string.IsNullOrWhiteSpace(request.SoftwareCertificateId)
                ? request.SoftwareCertificateId.Trim()
                : branch.PhilHealthSoftwareCertificateId;

            var endpoint = !string.IsNullOrWhiteSpace(request.KonsultaEndpoint)
                ? request.KonsultaEndpoint.Trim()
                : (!string.IsNullOrWhiteSpace(branch.PhilHealthKonsultaEndpoint) ? branch.PhilHealthKonsultaEndpoint : PhilHealthDefaults.KonsultaEndpoint);

            var isCustomUnsavedEndpoint = !string.IsNullOrWhiteSpace(request.KonsultaEndpoint) &&
                !string.Equals(request.KonsultaEndpoint.Trim(), branch.PhilHealthKonsultaEndpoint?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(request.KonsultaEndpoint.Trim(), PhilHealthDefaults.KonsultaEndpoint, StringComparison.OrdinalIgnoreCase);

            var username = !string.IsNullOrWhiteSpace(request.Username)
                ? request.Username.Trim()
                : (!isCustomUnsavedEndpoint && !string.IsNullOrWhiteSpace(branch.PhilHealthEncryptedUsername) ? protector.Unprotect(branch.PhilHealthEncryptedUsername) : null);

            var password = !string.IsNullOrWhiteSpace(request.Password)
                ? request.Password
                : (!isCustomUnsavedEndpoint && !string.IsNullOrWhiteSpace(branch.PhilHealthEncryptedPassword) ? protector.Unprotect(branch.PhilHealthEncryptedPassword) : null);

            if (string.IsNullOrWhiteSpace(accreditationNumber))
            {
                return Results.Ok(ApiResponse<PhilHealthTestConnectionResult>.Success(
                    new PhilHealthTestConnectionResult(false, "PhilHealth Accreditation Number (Hospital Code) is required to test gateway connectivity.")));
            }

            if (string.IsNullOrWhiteSpace(username))
            {
                return Results.Ok(ApiResponse<PhilHealthTestConnectionResult>.Success(
                    new PhilHealthTestConnectionResult(false, "SOAP Username is required to authenticate with the PhilHealth gateway.")));
            }

            if (string.IsNullOrWhiteSpace(password))
            {
                return Results.Ok(ApiResponse<PhilHealthTestConnectionResult>.Success(
                    new PhilHealthTestConnectionResult(false, "SOAP Password is required to authenticate with the PhilHealth gateway.")));
            }

            var result = await soapTester.TestConnectionAsync(
                accreditationNumber: accreditationNumber,
                username: username,
                password: password,
                softwareCertificateId: softwareCertId,
                endpoint: endpoint,
                ct: ct);

            return Results.Ok(ApiResponse<PhilHealthTestConnectionResult>.Success(result));
        })
        .RequireAuthorization()
        .WithName("TestBranchPhilHealthConnection")
        .WithDescription("Tests live connectivity and authentication with PhilHealth SOAP gateway before or after saving credentials.");

        // 6. Assign facilities to a branch
        branches.MapPost("/{id:guid}/facilities", async (
            Guid id,
            List<Guid> facilityIds,
            HttpContext httpContext,
            IApplicationDbContext context) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var branch = await context.Branches.FirstOrDefaultAsync(b => b.Id == id && !b.IsDeleted);
            if (branch == null)
            {
                return Results.NotFound(new { Message = "Branch not found." });
            }

            var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == branch.TenantId);
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

            var facilities = await context.Facilities
                .Where(f => f.TenantId == branch.TenantId && facilityIds.Contains(f.Id))
                .ToListAsync();

            await BranchFacilityRules.EnsureCanLinkAsync(context, branch, facilities, CancellationToken.None);

            foreach (var fac in facilities)
            {
                fac.BranchId = branch.Id;
                fac.UpdatedAt = DateTime.UtcNow;
                fac.UpdatedBy = clerkUserId;
            }

            await context.SaveChangesAsync(CancellationToken.None);
            return Results.Ok(ApiResponse<bool>.Success(true, "Facilities linked to branch successfully."));
        })
        .RequireAuthorization()
        .WithName("AssignFacilitiesToBranch")
        .WithDescription("Associates one or more facilities (Clinic, Lab, Pharmacy) to a physical branch.");

        // Unlink a facility from a branch
        branches.MapDelete("/{id:guid}/facilities/{facilityId:guid}", async (
            Guid id,
            Guid facilityId,
            HttpContext httpContext,
            IApplicationDbContext context) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == facilityId && f.BranchId == id && !f.IsDeleted);
            if (facility == null)
            {
                return Results.NotFound(new { Message = "Facility not found in this branch." });
            }

            facility.BranchId = null;
            facility.UpdatedAt = DateTime.UtcNow;
            facility.UpdatedBy = clerkUserId;

            await context.SaveChangesAsync(CancellationToken.None);
            return Results.Ok(ApiResponse<bool>.Success(true, "Facility unlinked from branch."));
        })
        .RequireAuthorization()
        .WithName("UnlinkFacilityFromBranch");

        // Delete a branch (soft delete and decouple facilities)
        branches.MapDelete("/{id:guid}", async (
            Guid id,
            HttpContext httpContext,
            IApplicationDbContext context) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var branch = await context.Branches
                .Include(b => b.Facilities)
                .FirstOrDefaultAsync(b => b.Id == id && !b.IsDeleted);

            if (branch == null)
            {
                return Results.NotFound(new { Message = "Branch not found." });
            }

            var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == branch.TenantId);
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

            foreach (var fac in branch.Facilities)
            {
                fac.BranchId = null;
                fac.UpdatedAt = DateTime.UtcNow;
                fac.UpdatedBy = clerkUserId;
            }

            branch.IsDeleted = true;
            branch.DeletedAt = DateTime.UtcNow;
            branch.DeletedBy = clerkUserId;

            await context.SaveChangesAsync(CancellationToken.None);
            return Results.Ok(ApiResponse<bool>.Success(true, "Branch deleted successfully."));
        })
        .RequireAuthorization()
        .WithName("DeleteBranch");
    }
}
