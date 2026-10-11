using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Schedules.DTOs;
using ClinicEz.Clinic.Application.Features.Schedules.Services;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Schedules.Queries;

public sealed record GetDoctorAvailableSlotsQuery(
    Guid DoctorId,
    DateOnly Date,
    int? RequestedSlotDurationMinutes = null) : IRequest<DoctorAvailabilityDto>;

public sealed class GetDoctorAvailableSlotsQueryHandler
    : IRequestHandler<GetDoctorAvailableSlotsQuery, DoctorAvailabilityDto>
{
    private readonly ISlotAvailabilityService _slotAvailabilityService;
    private readonly IClinicContext _clinicContext;

    public GetDoctorAvailableSlotsQueryHandler(
        ISlotAvailabilityService slotAvailabilityService,
        IClinicContext clinicContext)
    {
        _slotAvailabilityService = slotAvailabilityService;
        _clinicContext = clinicContext;
    }

    public Task<DoctorAvailabilityDto> Handle(GetDoctorAvailableSlotsQuery request, CancellationToken ct)
    {
        return _slotAvailabilityService.GetDoctorAvailabilityAsync(
            _clinicContext.ClinicId,
            request.DoctorId,
            request.Date,
            request.RequestedSlotDurationMinutes,
            ct);
    }
}
