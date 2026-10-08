using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Staff.Queries;

public sealed record GetStaffMembersQuery(StaffRole? Role = null, bool? IsActive = null) : IRequest<IReadOnlyList<StaffMemberDto>>;

public sealed class GetStaffMembersQueryHandler : IRequestHandler<GetStaffMembersQuery, IReadOnlyList<StaffMemberDto>>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IClinicContext _clinicContext;

    public GetStaffMembersQueryHandler(
        IRepository<StaffMember> staffRepository,
        IClinicContext clinicContext)
    {
        _staffRepository = staffRepository;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<StaffMemberDto>> Handle(GetStaffMembersQuery request, CancellationToken cancellationToken)
    {
        var query = _staffRepository.Query(s => s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .AsQueryable();

        if (request.Role.HasValue)
        {
            query = query.Where(s => s.Role == request.Role.Value);
        }

        if (request.IsActive.HasValue)
        {
            query = query.Where(s => s.IsActive == request.IsActive.Value);
        }

        var list = await query
            .OrderBy(s => s.LastName)
            .ThenBy(s => s.FirstName)
            .ToListAsync(cancellationToken);

        return list.Select(staff => new StaffMemberDto(
            staff.Id,
            staff.TenantId,
            staff.ClinicId,
            staff.ClinicRoleId,
            staff.ClinicRole?.Name,
            staff.FirstName,
            staff.LastName,
            staff.MiddleName,
            staff.Title,
            staff.Role,
            staff.Email,
            staff.PhoneNumber,
            staff.PrcLicenseNumber,
            staff.PtrNumber,
            staff.S2LicenseNumber,
            staff.Specialty,
            staff.IsActive,
            staff.CreatedAt,
            HasCredentials: !string.IsNullOrEmpty(staff.PasswordHash),
            MustChangePassword: staff.MustChangePassword
        )).ToList();
    }
}

public sealed record GetStaffMemberByIdQuery(Guid Id) : IRequest<StaffMemberDto>;

public sealed class GetStaffMemberByIdQueryHandler : IRequestHandler<GetStaffMemberByIdQuery, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IClinicContext _clinicContext;

    public GetStaffMemberByIdQueryHandler(
        IRepository<StaffMember> staffRepository,
        IClinicContext clinicContext)
    {
        _staffRepository = staffRepository;
        _clinicContext = clinicContext;
    }

    public async Task<StaffMemberDto> Handle(GetStaffMemberByIdQuery request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.Id && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.Id}' was not found in this clinic.");
        }

        return new StaffMemberDto(
            staff.Id,
            staff.TenantId,
            staff.ClinicId,
            staff.ClinicRoleId,
            staff.ClinicRole?.Name,
            staff.FirstName,
            staff.LastName,
            staff.MiddleName,
            staff.Title,
            staff.Role,
            staff.Email,
            staff.PhoneNumber,
            staff.PrcLicenseNumber,
            staff.PtrNumber,
            staff.S2LicenseNumber,
            staff.Specialty,
            staff.IsActive,
            staff.CreatedAt,
            HasCredentials: !string.IsNullOrEmpty(staff.PasswordHash),
            MustChangePassword: staff.MustChangePassword);
    }
}
