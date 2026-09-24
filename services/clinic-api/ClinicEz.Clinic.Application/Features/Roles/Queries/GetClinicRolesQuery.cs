using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Roles.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Roles.Queries;

public sealed record GetClinicRolesQuery : IRequest<IReadOnlyList<ClinicRoleDto>>;

public sealed class GetClinicRolesQueryHandler : IRequestHandler<GetClinicRolesQuery, IReadOnlyList<ClinicRoleDto>>
{
    private readonly IRepository<ClinicRole> _roleRepository;
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IClinicContext _clinicContext;

    public GetClinicRolesQueryHandler(
        IRepository<ClinicRole> roleRepository,
        IRepository<StaffMember> staffRepository,
        IClinicContext clinicContext)
    {
        _roleRepository = roleRepository;
        _staffRepository = staffRepository;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<ClinicRoleDto>> Handle(GetClinicRolesQuery request, CancellationToken cancellationToken)
    {
        var roles = await _roleRepository.Query(r => r.ClinicId == _clinicContext.ClinicId)
            .OrderByDescending(r => r.IsSystem)
            .ThenBy(r => r.Name)
            .ToListAsync(cancellationToken);

        var staffCounts = await _staffRepository.Query(s => s.ClinicId == _clinicContext.ClinicId && s.ClinicRoleId != null)
            .GroupBy(s => s.ClinicRoleId!.Value)
            .Select(g => new { RoleId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RoleId, x => x.Count, cancellationToken);

        return roles.Select(r => new ClinicRoleDto(
            r.Id,
            r.TenantId,
            r.ClinicId,
            r.Name,
            r.Description,
            r.IsSystem,
            r.Permissions,
            staffCounts.GetValueOrDefault(r.Id, 0),
            r.CreatedAt
        )).ToList();
    }
}

public sealed record GetClinicPermissionsQuery : IRequest<IReadOnlyList<string>>;

public sealed class GetClinicPermissionsQueryHandler : IRequestHandler<GetClinicPermissionsQuery, IReadOnlyList<string>>
{
    public Task<IReadOnlyList<string>> Handle(GetClinicPermissionsQuery request, CancellationToken cancellationToken)
    {
        return Task.FromResult(ClinicPermissions.All);
    }
}
