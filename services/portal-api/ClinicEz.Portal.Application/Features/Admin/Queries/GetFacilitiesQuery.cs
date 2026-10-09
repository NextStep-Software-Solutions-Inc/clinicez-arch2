using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record FacilityDto(
    Guid Id,
    string Name,
    FacilityType FacilityType,
    FacilityStatus Status,
    DateTime CreatedAt,
    string Slug,
    string? ConsoleUrl,
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
    string? NotificationPreferencesJson = null,
    FacilityDeploymentMode DeploymentMode = FacilityDeploymentMode.SharedCloud,
    string? ConsoleBaseUrl = null,
    string Visibility = "Private",
    bool AcceptsExternalRequests = false
);

public record GetFacilitiesQuery(string TenantSlug) : IRequest<List<FacilityDto>>;

public class GetFacilitiesQueryHandler(
    IApplicationDbContext context,
    IConfiguration configuration
) : IRequestHandler<GetFacilitiesQuery, List<FacilityDto>>
{
    public async Task<List<FacilityDto>> Handle(GetFacilitiesQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.TenantSlug)) return [];

        var tenant = await context.Tenants.FirstOrDefaultAsync(t => 
            t.TenantSlug == request.TenantSlug || t.Id.ToString() == request.TenantSlug, 
            cancellationToken);

        if (tenant == null) return [];

        var rawFacilities = await context.Facilities
            .Where(f => f.TenantId == tenant.Id)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync(cancellationToken);

        return rawFacilities.Select(f =>
        {
            var slug = !string.IsNullOrWhiteSpace(f.Slug) ? f.Slug : GenerateFacilitySlug(f.Name);
            var consoleUrl = ResolveConsoleUrl(configuration, f.FacilityType, f.Status, f.Id, slug, tenant.TenantSlug, f.ConsoleBaseUrl);

            return new FacilityDto(
                f.Id,
                f.Name,
                f.FacilityType,
                f.Status,
                f.CreatedAt,
                slug,
                consoleUrl,
                f.Classification,
                f.LicenseToOperate,
                f.PhilHealthAccreditationNumber,
                f.TaxIdentificationNumber,
                f.OperatingHours,
                f.Region,
                f.Province,
                f.City,
                f.Barangay,
                f.ZipCode,
                f.StreetAddress,
                f.ContactNumber,
                f.ContactEmail,
                f.NotificationPreferencesJson,
                f.DeploymentMode,
                f.ConsoleBaseUrl,
                f.Visibility.ToString(),
                f.AcceptsExternalRequests
            );
        }).ToList();
    }

    public static string? ResolveConsoleUrl(
        IConfiguration configuration,
        FacilityType facilityType,
        FacilityStatus status,
        Guid facilityId,
        string facilitySlug,
        string? tenantSlug = null,
        string? consoleBaseUrlOverride = null)
    {
        if (status != FacilityStatus.Active)
        {
            return null;
        }

        // An explicit address (on-premise facilities) wins over the generated subdomain URL.
        if (!string.IsNullOrWhiteSpace(consoleBaseUrlOverride))
        {
            return consoleBaseUrlOverride;
        }

        var baseDomain = configuration["Facility:BaseDomain"];
        if (string.IsNullOrWhiteSpace(baseDomain))
        {
            return null;
        }

        var cleanBaseDomain = baseDomain.Trim().TrimStart('.');

        var subdomain = facilityType switch
        {
            FacilityType.Clinic => configuration["Facility:Subdomains:Clinic"] ?? "clinic",
            FacilityType.Laboratory => configuration["Facility:Subdomains:Laboratory"] ?? "lab",
            FacilityType.Pharmacy => configuration["Facility:Subdomains:Pharmacy"] ?? "pharmacy",
            FacilityType.Organization => configuration["Facility:Subdomains:Organization"] ?? "org",
            _ => "clinic"
        };

        var cleanSlug = facilitySlug?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(cleanSlug))
        {
            return $"https://{subdomain}.{cleanBaseDomain}";
        }

        return $"https://{cleanSlug}.{subdomain}.{cleanBaseDomain}";
    }

    public static string GenerateFacilitySlug(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "facility";
        var slug = Regex.Replace(name.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(slug) ? "facility" : slug;
    }
}
