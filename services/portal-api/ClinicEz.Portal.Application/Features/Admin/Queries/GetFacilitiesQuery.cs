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
    string ConsoleUrl
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

        var baseDomain = configuration["Console:BaseDomain"] ?? "clinicez.ph";
        var isDev = string.Equals(configuration["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(configuration["Environment"], "Development", StringComparison.OrdinalIgnoreCase) ||
                    (bool.TryParse(configuration["Console:ForceLocal"], out var forceLocal) && forceLocal);

        return rawFacilities.Select(f =>
        {
            var slug = GenerateFacilitySlug(f.Name);
            var devPort = f.FacilityType switch
            {
                FacilityType.Clinic => configuration["Console:DevPorts:Clinic"] ?? "5245",
                FacilityType.Laboratory => configuration["Console:DevPorts:Laboratory"] ?? "5245",
                FacilityType.Pharmacy => configuration["Console:DevPorts:Pharmacy"] ?? "5245",
                FacilityType.Organization => configuration["Console:DevPorts:Organization"] ?? "5245",
                _ => "5245"
            };

            var consoleUrl = isDev 
                ? $"http://localhost:{devPort}" 
                : $"https://{slug}.{baseDomain}";

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

    public static string GenerateFacilitySlug(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "facility";
        var slug = Regex.Replace(name.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(slug) ? "facility" : slug;
    }
}
