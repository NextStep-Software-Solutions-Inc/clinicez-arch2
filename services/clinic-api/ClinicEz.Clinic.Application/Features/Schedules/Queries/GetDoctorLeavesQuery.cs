using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Schedules.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Schedules.Queries;

public sealed record GetDoctorLeavesQuery(
    Guid? DoctorId = null) : IRequest<List<DoctorLeaveDto>>;

public sealed class GetDoctorLeavesQueryHandler
    : IRequestHandler<GetDoctorLeavesQuery, List<DoctorLeaveDto>>
{
    private readonly IRepository<DoctorLeave> _leaveRepo;
    private readonly IClinicContext _clinicContext;

    public GetDoctorLeavesQueryHandler(
        IRepository<DoctorLeave> leaveRepo,
        IClinicContext clinicContext)
    {
        _leaveRepo = leaveRepo;
        _clinicContext = clinicContext;
    }

    public async Task<List<DoctorLeaveDto>> Handle(GetDoctorLeavesQuery request, CancellationToken ct)
    {
        var query = _leaveRepo.Query()
            .Where(l => l.ClinicId == _clinicContext.ClinicId && !l.IsDeleted);

        if (request.DoctorId.HasValue)
        {
            query = query.Where(l => l.DoctorId == request.DoctorId.Value || l.DoctorId == null);
        }

        var leaves = await query
            .OrderByDescending(l => l.StartDate)
            .ToListAsync(ct);

        return leaves.Select(l => new DoctorLeaveDto(
            l.Id,
            l.DoctorId,
            l.DoctorName,
            l.StartDate,
            l.EndDate,
            l.PartialDayStartTime,
            l.PartialDayEndTime,
            l.Reason,
            l.Status,
            l.LeaveType,
            l.CreatedAt)).ToList();
    }
}
