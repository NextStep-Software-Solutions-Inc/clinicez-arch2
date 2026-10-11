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

public sealed record GetDoctorScheduleTemplatesQuery(
    Guid DoctorId) : IRequest<List<DoctorScheduleTemplateDto>>;

public sealed class GetDoctorScheduleTemplatesQueryHandler
    : IRequestHandler<GetDoctorScheduleTemplatesQuery, List<DoctorScheduleTemplateDto>>
{
    private readonly IRepository<DoctorScheduleTemplate> _templateRepo;
    private readonly IClinicContext _clinicContext;

    public GetDoctorScheduleTemplatesQueryHandler(
        IRepository<DoctorScheduleTemplate> templateRepo,
        IClinicContext clinicContext)
    {
        _templateRepo = templateRepo;
        _clinicContext = clinicContext;
    }

    public async Task<List<DoctorScheduleTemplateDto>> Handle(
        GetDoctorScheduleTemplatesQuery request,
        CancellationToken ct)
    {
        var templates = await _templateRepo.Query()
            .Include(t => t.BreakTimes)
            .Where(t => t.ClinicId == _clinicContext.ClinicId &&
                        t.DoctorId == request.DoctorId &&
                        !t.IsDeleted)
            .OrderBy(t => t.DayOfWeek)
            .ToListAsync(ct);

        return templates.Select(t => new DoctorScheduleTemplateDto(
            t.Id,
            t.DoctorId,
            t.DoctorName,
            t.DayOfWeek,
            t.StartTime,
            t.EndTime,
            t.IsOvernightShift,
            t.SlotDurationMinutes,
            t.MaxPatientsPerSlot,
            t.IsActive,
            t.EffectiveStartDate,
            t.EffectiveEndDate,
            t.BreakTimes
                .Where(b => !b.IsDeleted)
                .Select(b => new DoctorBreakTimeDto(b.Id, b.Description, b.StartTime, b.EndTime))
                .ToList()
        )).ToList();
    }
}
