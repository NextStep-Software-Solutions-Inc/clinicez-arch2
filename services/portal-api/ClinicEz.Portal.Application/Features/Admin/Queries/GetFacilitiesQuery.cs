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
            var consoleUrl = ResolveConsoleUrl(configuration, f.FacilityType, f.Status, f.Id, slug, tenant.TenantSlug);

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
                f.LogoUrl,
                f.LetterheadHeader,
                f.LetterheadSubHeader,
                f.LetterheadAddress,
                f.LetterheadContact,
                f.LetterheadFooter,
                f.StampPhysicianName,
                f.StampPrcLicense,
                f.StampPtrNumber,
                f.StampS2License,
                f.NotificationPreferencesJson
            );
        }).ToList();
    }

    public static string? ResolveConsoleUrl(
        IConfiguration configuration,
        FacilityType facilityType,
        FacilityStatus status,
        Guid facilityId,
        string facilitySlug,
        string? tenantSlug = null)
    {
        if (status != FacilityStatus.Active)
        {
            return null;
        }

        var forceLocal = (bool.TryParse(configuration["Console:ForceLocal"], out var fl) && fl) ||
                         (bool.TryParse(configuration["Console:UseLocalhost"], out var ul) && ul);

        if (forceLocal)
        {
            var devPort = facilityType switch
            {
                FacilityType.Clinic => configuration["Console:DevPorts:Clinic"] ?? "8081",
                FacilityType.Laboratory => configuration["Console:DevPorts:Laboratory"] ?? "8082",
                FacilityType.Pharmacy => configuration["Console:DevPorts:Pharmacy"] ?? "8083",
                FacilityType.Organization => configuration["Console:DevPorts:Organization"] ?? "8084",
                _ => "8081"
            };

            var devTenant = !string.IsNullOrWhiteSpace(tenantSlug) ? tenantSlug : facilitySlug;
            return $"http://localhost:{devPort}?tenant={devTenant}&facilityId={facilityId}";
        }

        var isDev = string.Equals(configuration["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(configuration["Environment"], "Development", StringComparison.OrdinalIgnoreCase);

        var defaultBaseDomain = isDev ? "dev.clinicez.net" : "clinicez.net";
        var configuredBaseDomain = configuration["Console:BaseDomain"];

        var baseDomain = string.IsNullOrWhiteSpace(configuredBaseDomain)
            ? defaultBaseDomain
            : (isDev && string.Equals(configuredBaseDomain, "clinicez.net", StringComparison.OrdinalIgnoreCase) ? defaultBaseDomain : configuredBaseDomain);

        var subdomain = facilityType switch
        {
            FacilityType.Clinic => configuration["Console:Subdomains:Clinic"] ?? "clinic",
            FacilityType.Laboratory => configuration["Console:Subdomains:Laboratory"] ?? "lab",
            FacilityType.Pharmacy => configuration["Console:Subdomains:Pharmacy"] ?? "pharmacy",
            FacilityType.Organization => configuration["Console:Subdomains:Organization"] ?? "org",
            _ => "clinic"
        };

        var cleanSlug = facilitySlug?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(cleanSlug))
        {
            return $"https://{subdomain}.{baseDomain}?facilityId={facilityId}";
        }

        return $"https://{cleanSlug}.{subdomain}.{baseDomain}?facilityId={facilityId}";
    }

    public static string GenerateFacilitySlug(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "facility";
        var slug = Regex.Replace(name.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(slug) ? "facility" : slug;
    }
}
