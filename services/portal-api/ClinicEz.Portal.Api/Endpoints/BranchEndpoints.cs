using System.Security.Claims;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
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

public record InternalPhilHealthConfigResponse(
    Guid TenantId,
    Guid? BranchId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string Username,
    string Password,
    string CipherKey,
    string KonsultaEndpoint,
    bool IsActive);

public class BranchEndpoints : IEndpoint
{
    private const string DataProtectionPurpose = "ClinicEz.Portal.PhilHealthCredentials";

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var branches = app.MapGroup("/branches").WithTags("Branches");

        // 1. Create a physical branch under a tenant
        branches.MapPost("", async (
            CreateBranchRequest request,
            HttpContext httpContext,
            IApplicationDbContext context) =>
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
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

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
            var isStaff = !isOwner && await context.StaffMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == "Active");

            if (!isOwner && !isStaff)
            {
                return Results.Forbid();
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
            var isStaff = !isOwner && await context.StaffMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == "Active");

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
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

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

            await context.SaveChangesAsync(CancellationToken.None);

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
            IDataProtectionProvider dataProtectionProvider) =>
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
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            var protector = dataProtectionProvider.CreateProtector(DataProtectionPurpose);

            branch.PhilHealthAccreditationNumber = request.AccreditationNumber?.Trim();
            branch.PhilHealthPmccNumber = request.PmccNumber?.Trim();
            branch.PhilHealthSoftwareCertificateId = request.SoftwareCertificateId?.Trim();
            branch.PhilHealthKonsultaEndpoint = !string.IsNullOrWhiteSpace(request.KonsultaEndpoint)
                ? request.KonsultaEndpoint.Trim()
                : "https://staging.philhealth.gov.ph/KONSULTA/SOAP";
            branch.IsPhilHealthAccredited = request.IsPhilHealthAccredited;

            if (!string.IsNullOrWhiteSpace(request.Username))
                branch.PhilHealthEncryptedUsername = protector.Protect(request.Username.Trim());

            if (!string.IsNullOrWhiteSpace(request.Password))
                branch.PhilHealthEncryptedPassword = protector.Protect(request.Password);

            if (!string.IsNullOrWhiteSpace(request.CipherKey))
                branch.PhilHealthEncryptedCipherKey = protector.Protect(request.CipherKey);

            branch.UpdatedAt = DateTime.UtcNow;
            branch.UpdatedBy = clerkUserId;

            await context.SaveChangesAsync(CancellationToken.None);

            return Results.Ok(ApiResponse<bool>.Success(true, "PhilHealth statutory credentials configured successfully."));
        })
        .RequireAuthorization()
        .WithName("ConfigureBranchPhilHealth")
        .WithDescription("Encrypted configuration of PhilHealth PMCC, software cert, and SOAP credentials on a branch.");

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
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s =>
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            var facilities = await context.Facilities
                .Where(f => f.TenantId == branch.TenantId && facilityIds.Contains(f.Id))
                .ToListAsync();

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

        // ── Internal Endpoints (Invoked by philhealth-proxy via resilient HTTP) ──────
        var internalApi = app.MapGroup("/internal").WithTags("Internal PhilHealth Proxy Gateway");

        // 7. GET decrypted PhilHealth config by Branch ID
        internalApi.MapGet("/branches/{branchId:guid}/philhealth-config", async (
            Guid branchId,
            IApplicationDbContext context,
            IDataProtectionProvider dataProtectionProvider) =>
        {
            var branch = await context.Branches
                .Include(b => b.Tenant)
                .FirstOrDefaultAsync(b => b.Id == branchId && !b.IsDeleted);

            if (branch == null)
            {
                return Results.NotFound(new { Message = $"Branch {branchId} not found." });
            }

            var protector = dataProtectionProvider.CreateProtector(DataProtectionPurpose);

            string username = string.Empty;
            if (!string.IsNullOrEmpty(branch.PhilHealthEncryptedUsername))
            {
                try { username = protector.Unprotect(branch.PhilHealthEncryptedUsername); } catch { username = branch.PhilHealthEncryptedUsername; }
            }

            string password = string.Empty;
            if (!string.IsNullOrEmpty(branch.PhilHealthEncryptedPassword))
            {
                try { password = protector.Unprotect(branch.PhilHealthEncryptedPassword); } catch { password = branch.PhilHealthEncryptedPassword; }
            }

            string cipherKey = string.Empty;
            if (!string.IsNullOrEmpty(branch.PhilHealthEncryptedCipherKey))
            {
                try { cipherKey = protector.Unprotect(branch.PhilHealthEncryptedCipherKey); } catch { cipherKey = branch.PhilHealthEncryptedCipherKey; }
            }

            var result = new InternalPhilHealthConfigResponse(
                TenantId: branch.TenantId,
                BranchId: branch.Id,
                FacilityName: branch.Name,
                AccreditationNumber: branch.PhilHealthAccreditationNumber ?? string.Empty,
                PmccNumber: branch.PhilHealthPmccNumber ?? string.Empty,
                SoftwareCertificateId: branch.PhilHealthSoftwareCertificateId ?? string.Empty,
                Username: username,
                Password: password,
                CipherKey: cipherKey,
                KonsultaEndpoint: branch.PhilHealthKonsultaEndpoint ?? "https://staging.philhealth.gov.ph/KONSULTA/SOAP",
                IsActive: branch.IsActive && branch.IsPhilHealthAccredited);

            return Results.Ok(result);
        })
        .WithName("GetInternalBranchPhilHealthConfig")
        .WithDescription("Internal microservice endpoint returning decrypted PhilHealth statutory credentials for a branch.");

        // 8. GET decrypted PhilHealth config by Tenant ID (Fallback for single-branch setups)
        internalApi.MapGet("/tenants/{tenantId}/philhealth-config", async (
            string tenantId,
            IApplicationDbContext context,
            IDataProtectionProvider dataProtectionProvider) =>
        {
            var tenant = await context.Tenants
                .Include(t => t.Branches)
                .FirstOrDefaultAsync(t => t.Id.ToString() == tenantId || t.TenantSlug.ToLower() == tenantId.ToLower());

            if (tenant == null)
            {
                return Results.NotFound(new { Message = $"Tenant {tenantId} not found." });
            }

            // Find accredited active branch first, or any active branch
            var branch = tenant.Branches.FirstOrDefault(b => !b.IsDeleted && b.IsActive && b.IsPhilHealthAccredited)
                         ?? tenant.Branches.FirstOrDefault(b => !b.IsDeleted && b.IsActive);

            if (branch == null)
            {
                return Results.NotFound(new { Message = $"No active branch found for tenant {tenantId}." });
            }

            var protector = dataProtectionProvider.CreateProtector(DataProtectionPurpose);

            string username = string.Empty;
            if (!string.IsNullOrEmpty(branch.PhilHealthEncryptedUsername))
            {
                try { username = protector.Unprotect(branch.PhilHealthEncryptedUsername); } catch { username = branch.PhilHealthEncryptedUsername; }
            }

            string password = string.Empty;
            if (!string.IsNullOrEmpty(branch.PhilHealthEncryptedPassword))
            {
                try { password = protector.Unprotect(branch.PhilHealthEncryptedPassword); } catch { password = branch.PhilHealthEncryptedPassword; }
            }

            string cipherKey = string.Empty;
            if (!string.IsNullOrEmpty(branch.PhilHealthEncryptedCipherKey))
            {
                try { cipherKey = protector.Unprotect(branch.PhilHealthEncryptedCipherKey); } catch { cipherKey = branch.PhilHealthEncryptedCipherKey; }
            }

            var result = new InternalPhilHealthConfigResponse(
                TenantId: tenant.Id,
                BranchId: branch.Id,
                FacilityName: string.IsNullOrWhiteSpace(branch.Name) ? tenant.Name : branch.Name,
                AccreditationNumber: branch.PhilHealthAccreditationNumber ?? string.Empty,
                PmccNumber: branch.PhilHealthPmccNumber ?? string.Empty,
                SoftwareCertificateId: branch.PhilHealthSoftwareCertificateId ?? string.Empty,
                Username: username,
                Password: password,
                CipherKey: cipherKey,
                KonsultaEndpoint: branch.PhilHealthKonsultaEndpoint ?? "https://staging.philhealth.gov.ph/KONSULTA/SOAP",
                IsActive: branch.IsActive && branch.IsPhilHealthAccredited);

            return Results.Ok(result);
        })
        .WithName("GetInternalTenantPhilHealthConfig")
        .WithDescription("Internal microservice fallback endpoint returning decrypted PhilHealth credentials for a tenant's primary branch.");

        // 9. PUT internal PhilHealth config by Tenant ID (Fallback configuration)
        internalApi.MapPut("/tenants/{tenantId}/philhealth-config", async (
            string tenantId,
            ConfigureBranchPhilHealthRequest request,
            IApplicationDbContext context,
            IDataProtectionProvider dataProtectionProvider) =>
        {
            var tenant = await context.Tenants
                .Include(t => t.Branches)
                .FirstOrDefaultAsync(t => t.Id.ToString() == tenantId || t.TenantSlug.ToLower() == tenantId.ToLower());

            if (tenant == null)
            {
                return Results.NotFound(new { Message = $"Tenant {tenantId} not found." });
            }

            var branch = tenant.Branches.FirstOrDefault(b => !b.IsDeleted && b.IsActive);
            if (branch == null)
            {
                branch = new Branch
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenant.Id,
                    Name = $"{tenant.Name} Main Branch",
                    Code = "MAIN-01",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "System"
                };
                context.Branches.Add(branch);
            }

            var protector = dataProtectionProvider.CreateProtector(DataProtectionPurpose);

            branch.PhilHealthAccreditationNumber = request.AccreditationNumber?.Trim();
            branch.PhilHealthPmccNumber = request.PmccNumber?.Trim();
            branch.PhilHealthSoftwareCertificateId = request.SoftwareCertificateId?.Trim();
            branch.PhilHealthKonsultaEndpoint = !string.IsNullOrWhiteSpace(request.KonsultaEndpoint)
                ? request.KonsultaEndpoint.Trim()
                : "https://staging.philhealth.gov.ph/KONSULTA/SOAP";
            branch.IsPhilHealthAccredited = request.IsPhilHealthAccredited;

            if (!string.IsNullOrWhiteSpace(request.Username))
                branch.PhilHealthEncryptedUsername = protector.Protect(request.Username.Trim());

            if (!string.IsNullOrWhiteSpace(request.Password))
                branch.PhilHealthEncryptedPassword = protector.Protect(request.Password);

            if (!string.IsNullOrWhiteSpace(request.CipherKey))
                branch.PhilHealthEncryptedCipherKey = protector.Protect(request.CipherKey);

            branch.UpdatedAt = DateTime.UtcNow;

            await context.SaveChangesAsync(CancellationToken.None);

            return Results.Ok(ApiResponse<bool>.Success(true, "Configured PhilHealth credentials on primary branch."));
        })
        .WithName("UpdateInternalTenantPhilHealthConfig")
        .WithDescription("Internal microservice fallback endpoint to update PhilHealth credentials on primary branch.");
    }
}
