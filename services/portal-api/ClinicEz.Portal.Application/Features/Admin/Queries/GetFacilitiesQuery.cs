using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record FacilityDto(
    Guid Id,
    string Name,
    FacilityType FacilityType,
    FacilityStatus Status,
    DateTime CreatedAt
);

public record GetFacilitiesQuery(string TenantSlug) : IRequest<List<FacilityDto>>;

public class GetFacilitiesQueryHandler(
    IApplicationDbContext context
) : IRequestHandler<GetFacilitiesQuery, List<FacilityDto>>
{
    public async Task<List<FacilityDto>> Handle(GetFacilitiesQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.TenantSlug)) return [];

        var tenant = await context.Tenants.FirstOrDefaultAsync(t => 
            t.TenantSlug == request.TenantSlug || t.Id.ToString() == request.TenantSlug, 
            cancellationToken);

        if (tenant == null) return [];

        var facilities = await context.Facilities
            .Where(f => f.TenantId == tenant.Id)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new FacilityDto(
                f.Id,
                f.Name,
                f.FacilityType,
                f.Status,
                f.CreatedAt
            ))
            .ToListAsync(cancellationToken);

        return facilities;
    }
}
