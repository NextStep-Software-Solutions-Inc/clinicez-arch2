using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Api.Endpoints;

public record PublicDirectoryClinicDto(
    Guid Id,
    string Slug,
    string TenantSlug,
    string Name,
    string Description,
    string? Address,
    string? City,
    string? Province,
    string? Region,
    string? ContactNumber,
    string? ContactEmail,
    string? OperatingHours,
    string? Classification,
    bool IsPhilHealthAccredited,
    int ProviderCount,
    string PrivacyPolicyUrl,
    string TermsUrl);

public record PublicDirectoryOrganizationDto(
    Guid Id,
    string Slug,
    string TenantSlug,
    string Name,
    string Description,
    string? City,
    string? Province,
    int MemberCount,
    int FacilityCount,
    string PrivacyPolicyUrl,
    string TermsUrl);

public record PublicDirectoryProviderDto(
    Guid Id,
    string Name,
    string Role,
    string Specialty,
    Guid? FacilityId,
    string? FacilityName,
    string? FacilitySlug,
    string TenantSlug,
    string? City,
    int FacilityCount,
    string PrivacyPolicyUrl,
    string TermsUrl);

/// <summary>
/// Public, anonymous directory endpoints backing the portal-web /clinics, /organizations, and /hp pages.
/// Serves real, synchronized facility, organization, and healthcare provider records from the portal registry.
/// </summary>
public sealed class PublicDirectoryEndpoints : IEndpoint
{
    private static readonly HashSet<string> NonClinicalRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "Billing",
        "Cashier",
        "Receptionist",
        "Front Desk",
        "IT Support",
        "Encoder"
    };

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/public/directory")
            .AllowAnonymous()
            .RequireRateLimiting("PublicApi")
            .WithTags("PublicDirectory");

        group.MapGet("/clinics", GetClinicsAsync)
            .WithName("GetPublicDirectoryClinics")
            .WithDescription("Returns active public clinics registered on the platform.");

        group.MapGet("/organizations", GetOrganizationsAsync)
            .WithName("GetPublicDirectoryOrganizations")
            .WithDescription("Returns active healthcare organizations and multi-facility networks on the platform.");

        group.MapGet("/providers", GetProvidersAsync)
            .WithName("GetPublicDirectoryProviders")
            .WithDescription("Returns active healthcare providers practicing at registered clinics.");
    }

    public static async Task<IResult> GetClinicsAsync(
        IApplicationDbContext context,
        string? q = null,
        string? city = null,
        CancellationToken ct = default)
    {
        var query = context.Facilities
            .AsNoTracking()
            .Include(f => f.Tenant)
            .Include(f => f.Branch)
            .Where(f => !f.IsDeleted
                        && f.Tenant.ArchivedAt == null
                        && f.FacilityType == FacilityType.Clinic
                        && (f.Status == FacilityStatus.Active || f.Status == FacilityStatus.Provisioning));

        if (!string.IsNullOrWhiteSpace(city))
        {
            var normalizedCity = city.Trim().ToLowerInvariant();
            query = query.Where(f =>
                (f.City != null && f.City.ToLower().Contains(normalizedCity)) ||
                (f.Branch != null && f.Branch.City != null && f.Branch.City.ToLower().Contains(normalizedCity)) ||
                (f.Tenant.City != null && f.Tenant.City.ToLower().Contains(normalizedCity)));
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            query = query.Where(f =>
                f.Name.ToLower().Contains(term) ||
                f.Slug.ToLower().Contains(term) ||
                (f.Classification != null && f.Classification.ToLower().Contains(term)) ||
                (f.City != null && f.City.ToLower().Contains(term)) ||
                f.Tenant.Name.ToLower().Contains(term));
        }

        var facilities = await query
            .OrderBy(f => f.Name)
            .ToListAsync(ct);

        var facilityIds = facilities.Select(f => f.Id).ToList();
        var tenantIds = facilities.Select(f => f.TenantId).Distinct().ToList();

        var staffMembers = await context.StaffMembers
            .AsNoTracking()
            .Include(s => s.WorkspaceMember)
            .Where(s => !s.IsDeleted
                        && tenantIds.Contains(s.TenantId)
                        && !s.WorkspaceMember.IsDeleted
                        && s.WorkspaceMember.Status == MemberStatus.Active)
            .ToListAsync(ct);

        var items = facilities.Select(f =>
        {
            var resolvedCity = FirstNonEmpty(f.City, f.Branch?.City, f.Tenant.City);
            var resolvedProvince = FirstNonEmpty(f.Province, f.Branch?.Province, f.Tenant.Province);
            var resolvedRegion = FirstNonEmpty(f.Region, f.Branch?.Region);
            var resolvedStreet = FirstNonEmpty(f.StreetAddress, f.Branch?.StreetAddress, f.Tenant.StreetLine1);
            var resolvedBarangay = FirstNonEmpty(f.Barangay, f.Branch?.Barangay);
            var resolvedAddress = BuildAddress(resolvedStreet, resolvedBarangay, resolvedCity, resolvedProvince);
            var isYakap = !string.IsNullOrWhiteSpace(f.PhilHealthAccreditationNumber)
                          || (f.Branch?.IsPhilHealthAccredited ?? false);

            var providerCount = staffMembers.Count(s =>
                (s.FacilityId == f.Id || (s.FacilityId == null && s.TenantId == f.TenantId))
                && !NonClinicalRoles.Contains(s.Role));
            if (providerCount == 0)
            {
                providerCount = Math.Max(1, staffMembers.Count(s => s.FacilityId == f.Id || s.TenantId == f.TenantId));
            }

            var classificationLabel = FirstNonEmpty(f.Classification, "Primary Care & Outpatient Clinic")!;
            var locationLabel = FirstNonEmpty(resolvedCity, resolvedProvince);
            var description = !string.IsNullOrWhiteSpace(locationLabel)
                ? $"{classificationLabel} in {locationLabel}{(isYakap ? " • PhilHealth YAKAP Accredited" : "")}"
                : $"{classificationLabel}{(isYakap ? " • PhilHealth YAKAP Accredited" : "")}";

            return new PublicDirectoryClinicDto(
                Id: f.Id,
                Slug: f.Slug,
                TenantSlug: f.Tenant.TenantSlug,
                Name: f.Name,
                Description: description,
                Address: resolvedAddress,
                City: resolvedCity,
                Province: resolvedProvince,
                Region: resolvedRegion,
                ContactNumber: FirstNonEmpty(f.ContactNumber, f.Branch?.ContactNumber, f.Tenant.PhoneNumber),
                ContactEmail: FirstNonEmpty(f.ContactEmail, f.Branch?.ContactEmail, f.Tenant.Email),
                OperatingHours: f.OperatingHours,
                Classification: f.Classification,
                IsPhilHealthAccredited: isYakap,
                ProviderCount: providerCount,
                PrivacyPolicyUrl: "/privacy",
                TermsUrl: "/terms");
        }).ToList();

        return Results.Ok(ApiResponse<List<PublicDirectoryClinicDto>>.Success(items));
    }

    public static async Task<IResult> GetOrganizationsAsync(
        IApplicationDbContext context,
        string? q = null,
        string? city = null,
        CancellationToken ct = default)
    {
        var orgFacilities = await context.Facilities
            .AsNoTracking()
            .Include(f => f.Tenant)
            .Include(f => f.Branch)
            .Where(f => !f.IsDeleted
                        && f.Tenant.ArchivedAt == null
                        && f.FacilityType == FacilityType.Organization
                        && (f.Status == FacilityStatus.Active || f.Status == FacilityStatus.Provisioning))
            .OrderBy(f => f.Name)
            .ToListAsync(ct);

        var activeTenants = await context.Tenants
            .AsNoTracking()
            .Include(t => t.Branches)
            .Where(t => !t.IsDeleted && t.ArchivedAt == null)
            .OrderBy(t => t.Name)
            .ToListAsync(ct);

        var facilityCountsByTenant = await context.Facilities
            .AsNoTracking()
            .Where(f => !f.IsDeleted && (f.Status == FacilityStatus.Active || f.Status == FacilityStatus.Provisioning))
            .GroupBy(f => f.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count, ct);

        var memberCountsByTenant = await context.WorkspaceMembers
            .AsNoTracking()
            .Where(m => !m.IsDeleted && m.Status == MemberStatus.Active)
            .GroupBy(m => m.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count, ct);

        var results = new List<PublicDirectoryOrganizationDto>();
        var coveredTenantIds = new HashSet<Guid>();

        foreach (var org in orgFacilities)
        {
            coveredTenantIds.Add(org.TenantId);
            var resolvedCity = FirstNonEmpty(org.City, org.Branch?.City, org.Tenant.City);
            var resolvedProvince = FirstNonEmpty(org.Province, org.Branch?.Province, org.Tenant.Province);
            var facCount = facilityCountsByTenant.GetValueOrDefault(org.TenantId, 1);
            var memCount = Math.Max(1, memberCountsByTenant.GetValueOrDefault(org.TenantId, org.Tenant.StaffAccountsCount));
            var locationSuffix = !string.IsNullOrWhiteSpace(resolvedCity) ? $" based in {resolvedCity}" : "";

            results.Add(new PublicDirectoryOrganizationDto(
                Id: org.Id,
                Slug: org.Slug,
                TenantSlug: org.Tenant.TenantSlug,
                Name: org.Name,
                Description: $"{FirstNonEmpty(org.Classification, "Healthcare Network")}{locationSuffix} ({facCount} {(facCount == 1 ? "facility" : "facilities")})",
                City: resolvedCity,
                Province: resolvedProvince,
                MemberCount: memCount,
                FacilityCount: facCount,
                PrivacyPolicyUrl: "/privacy",
                TermsUrl: "/terms"));
        }

        foreach (var tenant in activeTenants)
        {
            if (coveredTenantIds.Contains(tenant.Id)) continue;
            var facCount = facilityCountsByTenant.GetValueOrDefault(tenant.Id, 0);
            if (facCount == 0 && !string.Equals(tenant.TenantType, "Organization", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var memCount = Math.Max(1, memberCountsByTenant.GetValueOrDefault(tenant.Id, tenant.StaffAccountsCount));
            var locationSuffix = !string.IsNullOrWhiteSpace(tenant.City) ? $" in {tenant.City}" : "";

            results.Add(new PublicDirectoryOrganizationDto(
                Id: tenant.Id,
                Slug: tenant.TenantSlug,
                TenantSlug: tenant.TenantSlug,
                Name: FirstNonEmpty(tenant.TradingName, tenant.Name)!,
                Description: $"Integrated healthcare workspace{locationSuffix} operating {Math.Max(1, facCount)} {(facCount == 1 ? "facility" : "facilities")}",
                City: tenant.City,
                Province: tenant.Province,
                MemberCount: memCount,
                FacilityCount: Math.Max(1, facCount),
                PrivacyPolicyUrl: "/privacy",
                TermsUrl: "/terms"));
        }

        if (!string.IsNullOrWhiteSpace(city))
        {
            var normalizedCity = city.Trim().ToLowerInvariant();
            results = results
                .Where(r => r.City != null && r.City.ToLowerInvariant().Contains(normalizedCity))
                .ToList();
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            results = results
                .Where(r => r.Name.ToLowerInvariant().Contains(term)
                            || r.Description.ToLowerInvariant().Contains(term)
                            || r.Slug.ToLowerInvariant().Contains(term))
                .ToList();
        }

        return Results.Ok(ApiResponse<List<PublicDirectoryOrganizationDto>>.Success(results));
    }

    public static async Task<IResult> GetProvidersAsync(
        IApplicationDbContext context,
        string? q = null,
        string? facilitySlug = null,
        CancellationToken ct = default)
    {
        var staffQuery = context.StaffMembers
            .AsNoTracking()
            .Include(s => s.WorkspaceMember)
            .Include(s => s.Facility)
            .Include(s => s.Tenant)
            .Where(s => !s.IsDeleted
                        && !s.WorkspaceMember.IsDeleted
                        && s.WorkspaceMember.Status == MemberStatus.Active
                        && s.Tenant.ArchivedAt == null
                        && (s.Facility == null || (!s.Facility.IsDeleted && s.Facility.Status != FacilityStatus.Suspended)));

        if (!string.IsNullOrWhiteSpace(facilitySlug))
        {
            var normalizedSlug = facilitySlug.Trim().ToLowerInvariant();
            staffQuery = staffQuery.Where(s =>
                (s.Facility != null && s.Facility.Slug.ToLower() == normalizedSlug) ||
                s.Tenant.TenantSlug.ToLower() == normalizedSlug);
        }

        var staffList = await staffQuery
            .OrderBy(s => s.WorkspaceMember.FullName)
            .ToListAsync(ct);

        var clinicalStaff = staffList
            .Where(s => !NonClinicalRoles.Contains(s.Role) && !string.IsNullOrWhiteSpace(s.WorkspaceMember.FullName))
            .ToList();

        var items = clinicalStaff.Select(s =>
        {
            var roleLabel = string.IsNullOrWhiteSpace(s.Role) || string.Equals(s.Role, "Staff", StringComparison.OrdinalIgnoreCase)
                ? "General Practitioner"
                : s.Role;
            var facilityName = s.Facility?.Name ?? s.Tenant.Name;
            var resolvedSlug = s.Facility?.Slug;
            var resolvedCity = FirstNonEmpty(s.Facility?.City, s.Tenant.City);

            return new PublicDirectoryProviderDto(
                Id: s.Id,
                Name: s.WorkspaceMember.FullName,
                Role: roleLabel,
                Specialty: $"{roleLabel} • {facilityName}",
                FacilityId: s.FacilityId,
                FacilityName: facilityName,
                FacilitySlug: resolvedSlug,
                TenantSlug: s.Tenant.TenantSlug,
                City: resolvedCity,
                FacilityCount: 1,
                PrivacyPolicyUrl: "/privacy",
                TermsUrl: "/terms");
        }).ToList();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            items = items
                .Where(p => p.Name.ToLowerInvariant().Contains(term)
                            || p.Specialty.ToLowerInvariant().Contains(term)
                            || (p.FacilityName != null && p.FacilityName.ToLowerInvariant().Contains(term)))
                .ToList();
        }

        return Results.Ok(ApiResponse<List<PublicDirectoryProviderDto>>.Success(items));
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim();

    private static string? BuildAddress(params string?[] parts)
    {
        var nonEmpty = parts
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim())
            .ToList();
        return nonEmpty.Count > 0 ? string.Join(", ", nonEmpty) : null;
    }
}
