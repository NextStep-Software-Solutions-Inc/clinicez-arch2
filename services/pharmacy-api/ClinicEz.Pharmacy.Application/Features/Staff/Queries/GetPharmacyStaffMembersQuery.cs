using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Staff.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Staff.Queries;

public sealed record GetPharmacyStaffMembersQuery(Guid PharmacyId) : IRequest<List<PharmacyStaffMemberDto>>;

public sealed class GetPharmacyStaffMembersQueryHandler : IRequestHandler<GetPharmacyStaffMembersQuery, List<PharmacyStaffMemberDto>>
{
    private readonly IRepository<PharmacyStaffMember> _staffRepo;

    public GetPharmacyStaffMembersQueryHandler(IRepository<PharmacyStaffMember> staffRepo)
    {
        _staffRepo = staffRepo;
    }

    public async Task<List<PharmacyStaffMemberDto>> Handle(GetPharmacyStaffMembersQuery request, CancellationToken ct)
    {
        var staff = await _staffRepo.Query(s => s.PharmacyId == request.PharmacyId && !s.IsDeleted)
            .OrderBy(s => s.Role)
            .ThenBy(s => s.LastName)
            .ToListAsync(ct);

        return staff.Select(s => new PharmacyStaffMemberDto(
            s.Id,
            s.TenantId,
            s.PharmacyId,
            s.FirstName,
            s.LastName,
            s.MiddleName,
            s.Title,
            s.Role,
            s.Email,
            s.PhoneNumber,
            s.PrcLicenseNumber,
            s.S2LicenseNumber,
            s.IsActive,
            s.CreatedAt)).ToList();
    }
}
