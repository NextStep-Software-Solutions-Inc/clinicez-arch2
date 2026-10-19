using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Staff.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Staff.Queries;

public sealed record GetLabStaffMembersQuery(Guid LaboratoryId) : IRequest<List<LabStaffMemberDto>>;

public sealed class GetLabStaffMembersQueryHandler : IRequestHandler<GetLabStaffMembersQuery, List<LabStaffMemberDto>>
{
    private readonly IRepository<LabStaffMember> _staffRepo;

    public GetLabStaffMembersQueryHandler(IRepository<LabStaffMember> staffRepo)
    {
        _staffRepo = staffRepo;
    }

    public async Task<List<LabStaffMemberDto>> Handle(GetLabStaffMembersQuery request, CancellationToken ct)
    {
        var staff = await _staffRepo.Query(s => s.LaboratoryId == request.LaboratoryId && !s.IsDeleted)
            .OrderBy(s => s.Role)
            .ThenBy(s => s.LastName)
            .ToListAsync(ct);

        return staff.Select(s => new LabStaffMemberDto(
            s.Id,
            s.TenantId,
            s.LaboratoryId,
            s.FirstName,
            s.LastName,
            s.MiddleName,
            s.Title,
            s.Role,
            s.Email,
            s.PhoneNumber,
            s.PrcLicenseNumber,
            s.PtrNumber,
            s.Specialty,
            s.IsActive,
            s.CreatedAt)).ToList();
    }
}
