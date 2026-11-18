using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using MediatR;
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
    string TermsUrl,
    string? Title = null,
    string? Bio = null,
    string? AvatarUrl = null,
    bool IsVerified = true);

public sealed record ConfirmAffiliationHttpRequest(string? Token = null, string? OtpCode = null);

/// <summary>
/// Public, anonymous directory endpoints backing the portal-web /clinics, /organizations, /hp, and /confirm-affiliation pages.
/// Serves verified, discovery-eligible facility, organization, and practitioner records from the portal registry.
/// </summary>
public sealed class PublicDirectoryEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/public/directory")
            .AllowAnonymous()
            .RequireRateLimiting("PublicApi")
            .WithTags("PublicDirectory");

        group.MapGet("/clinics", GetClinicsAsync)
            .WithName("GetPublicDirectoryClinics")
            .WithDescription("Returns verified, discovery-eligible clinics registered on the platform.");

        group.MapGet("/organizations", GetOrganizationsAsync)
            .WithName("GetPublicDirectoryOrganizations")
            .WithDescription("Returns active healthcare organizations and multi-facility networks on the platform.");

        group.MapGet("/providers", GetProvidersAsync)
            .WithName("GetPublicDirectoryProviders")
            .WithDescription("Returns verified healthcare practitioners practicing at verified clinics.");

        app.MapGet("/public/practitioners/confirm-affiliation", GetConfirmAffiliationAsync)
            .AllowAnonymous()
            .RequireRateLimiting("PublicApi")
            .WithName("GetPractitionerAffiliationConfirmation")
            .WithDescription("Inspects a practitioner clinic-affiliation confirmation token.")
            .WithTags("PublicDirectory");

        app.MapPost("/public/practitioners/confirm-affiliation", ConfirmAffiliationAsync)
            .AllowAnonymous()
            .DisableAntiforgery()
            .RequireRateLimiting("PublicApi")
            .WithName("ConfirmPractitionerAffiliation")
            .WithDescription("Confirms a verified practitioner's affiliation with a clinic via token and optional OTP code.")
            .WithTags("PublicDirectory");
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
                        && f.Status == FacilityStatus.Active
                        && f.IsPatientDiscoveryEligible
                        && f.PlatformVerificationStatus == PlatformVerificationStatus.Verified);

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

        var verifiedAffiliations = facilityIds.Count == 0
            ? new List<PractitionerAffiliation>()
            : await context.PractitionerAffiliations
                .AsNoTracking()
                .Include(a => a.Practitioner)
                .Where(a => !a.IsDeleted
                            && facilityIds.Contains(a.FacilityId)
                            && a.AffiliationStatus == "Active"
                            && !a.Practitioner.IsDeleted
                            && a.Practitioner.MergedIntoPractitionerId == null
                            && a.Practitioner.VerificationStatus == PractitionerVerificationLevel.Verified)
                .ToListAsync(ct);

        var items = facilities.Select(f =>
        {
            var resolvedCity = FirstNonEmpty(f.City, f.Branch?.City, f.Tenant.City);
            var resolvedProvince = FirstNonEmpty(f.Province, f.Branch?.Province, f.Tenant.Province);
            var resolvedRegion = FirstNonEmpty(f.Region, f.Branch?.Region);
            var resolvedStreet = FirstNonEmpty(f.StreetAddress, f.Branch?.StreetAddress, f.Tenant.StreetLine1);
            var resolvedBarangay = FirstNonEmpty(f.Barangay, f.Branch?.Barangay);
            var resolvedAddress = BuildAddress(resolvedStreet, resolvedBarangay, resolvedCity, resolvedProvince);
            var isYakap = f.Branch != null && f.Branch.IsPhilHealthAccredited && !string.IsNullOrWhiteSpace(f.Branch.PhilHealthAccreditationNumber);

            var providerCount = verifiedAffiliations
                .Where(a => a.FacilityId == f.Id)
                .Select(a => a.PractitionerId)
                .Distinct()
                .Count();

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
        var affiliationsQuery = context.PractitionerAffiliations
            .AsNoTracking()
            .Include(a => a.Practitioner)
            .Include(a => a.Facility)
            .Include(a => a.Tenant)
            .Where(a => !a.IsDeleted
                        && a.AffiliationStatus == "Active"
                        && !a.Practitioner.IsDeleted
                        && a.Practitioner.MergedIntoPractitionerId == null
                        && a.Practitioner.VerificationStatus == PractitionerVerificationLevel.Verified
                        && !a.Facility.IsDeleted
                        && !a.Tenant.IsDeleted
                        && a.Tenant.ArchivedAt == null
                        && a.Facility.FacilityType == FacilityType.Clinic
                        && a.Facility.Status == FacilityStatus.Active
                        && a.Facility.IsPatientDiscoveryEligible
                        && a.Facility.PlatformVerificationStatus == PlatformVerificationStatus.Verified);

        if (!string.IsNullOrWhiteSpace(facilitySlug))
        {
            var normalizedSlug = facilitySlug.Trim().ToLowerInvariant();
            affiliationsQuery = affiliationsQuery.Where(a =>
                a.Facility.Slug.ToLower() == normalizedSlug ||
                a.Tenant.TenantSlug.ToLower() == normalizedSlug);
        }

        var affiliations = await affiliationsQuery
            .OrderBy(a => a.Practitioner.LastName)
            .ThenBy(a => a.Practitioner.FirstName)
            .ToListAsync(ct);

        var items = affiliations
            .GroupBy(a => a.PractitionerId)
            .Select(group =>
            {
                var primary = group.First();
                var prac = primary.Practitioner;
                var displayName = DirectoryVerificationHelper.FormatDisplayName(prac.Title, prac.FirstName, prac.LastName);
                var specialty = FirstNonEmpty(primary.LocalSpecialty, prac.PrimarySpecialty, prac.ProfessionKind)!;
                var facilityCount = group.Select(g => g.FacilityId).Distinct().Count();
                var resolvedCity = FirstNonEmpty(primary.Facility.City, primary.Tenant.City);

                return new PublicDirectoryProviderDto(
                    Id: prac.Id,
                    Name: displayName,
                    Role: prac.ProfessionKind,
                    Specialty: specialty,
                    FacilityId: primary.FacilityId,
                    FacilityName: primary.Facility.Name,
                    FacilitySlug: primary.Facility.Slug,
                    TenantSlug: primary.Tenant.TenantSlug,
                    City: resolvedCity,
                    FacilityCount: facilityCount,
                    PrivacyPolicyUrl: "/privacy",
                    TermsUrl: "/terms",
                    Title: prac.Title,
                    Bio: prac.PublicBio,
                    AvatarUrl: prac.AvatarUrl,
                    IsVerified: true);
            })
            .ToList();

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

    public static async Task<IResult> GetConfirmAffiliationAsync(
        string? token,
        ISender sender,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return Results.BadRequest(ApiResponse<AffiliationConfirmationInfoDto>.Fail(
                "Confirmation token is required.",
                "REQUIRED_FIELD_MISSING"));
        }

        var info = await sender.Send(new GetAffiliationConfirmationQuery(token), ct);
        if (info is null)
        {
            return Results.NotFound(ApiResponse<AffiliationConfirmationInfoDto>.Fail(
                "Invalid or unrecognized affiliation confirmation token.",
                "NOT_FOUND"));
        }

        if (info.IsExpired)
        {
            return Results.Json(
                ApiResponse<AffiliationConfirmationInfoDto>.Fail("This confirmation link has expired.", "TOKEN_EXPIRED"),
                statusCode: StatusCodes.Status410Gone);
        }

        return Results.Ok(ApiResponse<AffiliationConfirmationInfoDto>.Success(info));
    }

    public static async Task<IResult> ConfirmAffiliationAsync(
        string? token,
        string? otpCode,
        HttpContext httpContext,
        ISender sender,
        CancellationToken ct = default)
    {
        ConfirmAffiliationHttpRequest? body = null;
        if (httpContext.Request.ContentLength != 0 && httpContext.Request.HasJsonContentType())
        {
            try
            {
                body = await httpContext.Request.ReadFromJsonAsync<ConfirmAffiliationHttpRequest>(cancellationToken: ct);
            }
            catch (JsonException)
            {
                return Results.BadRequest(ApiResponse<AffiliationConfirmationResultDto>.Fail("Invalid JSON request.", "INVALID_JSON"));
            }
        }

        var resolvedToken = !string.IsNullOrWhiteSpace(token) ? token : body?.Token;
        var resolvedOtp = !string.IsNullOrWhiteSpace(otpCode) ? otpCode : body?.OtpCode;

        if (string.IsNullOrWhiteSpace(resolvedToken))
        {
            return Results.BadRequest(ApiResponse<AffiliationConfirmationResultDto>.Fail(
                "Confirmation token is required.",
                "REQUIRED_FIELD_MISSING"));
        }

        try
        {
            var result = await sender.Send(new ConfirmPractitionerAffiliationCommand(resolvedToken, resolvedOtp), ct);
            return Results.Ok(ApiResponse<AffiliationConfirmationResultDto>.Success(result));
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(ApiResponse<AffiliationConfirmationResultDto>.Fail(ex.Message, "NOT_FOUND"));
        }
        catch (CodedConflictException ex)
        {
            return Results.Conflict(ApiResponse<AffiliationConfirmationResultDto>.Fail(ex.Message, ex.Code));
        }
        catch (InvalidOperationException ex)
        {
            return Results.Json(
                ApiResponse<AffiliationConfirmationResultDto>.Fail(ex.Message, "TOKEN_EXPIRED"),
                statusCode: StatusCodes.Status410Gone);
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(ApiResponse<AffiliationConfirmationResultDto>.Fail(ex.Message, "INVALID_REQUEST"));
        }
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
