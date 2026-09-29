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
    string? ConsoleUrl
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
            var slug = GenerateFacilitySlug(f.Name);
            var consoleUrl = ResolveConsoleUrl(configuration, f.FacilityType, f.Status, f.Id, tenant.TenantSlug);

            return new FacilityDto(
                f.Id,
                f.Name,
                f.FacilityType,
                f.Status,
                f.CreatedAt,
                slug,
                consoleUrl
            );
        }).ToList();
    }

    public static string? ResolveConsoleUrl(
        IConfiguration configuration,
        FacilityType facilityType,
        FacilityStatus status,
        Guid facilityId,
        string tenantSlug)
    {
        if (status != FacilityStatus.Active)
        {
            return null;
        }

        var baseDomain = configuration["Console:BaseDomain"] ?? "clinicez.ph";
        var isDev = string.Equals(configuration["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(configuration["Environment"], "Development", StringComparison.OrdinalIgnoreCase) ||
                    (bool.TryParse(configuration["Console:ForceLocal"], out var forceLocal) && forceLocal);

        if (isDev)
        {
            var devPort = facilityType switch
            {
                FacilityType.Clinic => configuration["Console:DevPorts:Clinic"] ?? "8081",
                FacilityType.Laboratory => configuration["Console:DevPorts:Laboratory"] ?? "8082",
                FacilityType.Pharmacy => configuration["Console:DevPorts:Pharmacy"] ?? "8083",
                FacilityType.Organization => configuration["Console:DevPorts:Organization"] ?? "8084",
                _ => "8081"
            };

            return $"http://localhost:{devPort}?tenant={tenantSlug}&facilityId={facilityId}";
        }

        var subdomain = facilityType switch
        {
            FacilityType.Clinic => configuration["Console:Subdomains:Clinic"] ?? "clinic",
            FacilityType.Laboratory => configuration["Console:Subdomains:Laboratory"] ?? "lab",
            FacilityType.Pharmacy => configuration["Console:Subdomains:Pharmacy"] ?? "pharmacy",
            FacilityType.Organization => configuration["Console:Subdomains:Organization"] ?? "org",
            _ => "clinic"
        };

        return $"https://{subdomain}.{baseDomain}?tenant={tenantSlug}&facilityId={facilityId}";
    }

    public static string GenerateFacilitySlug(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "facility";
        var slug = Regex.Replace(name.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(slug) ? "facility" : slug;
    }
}
