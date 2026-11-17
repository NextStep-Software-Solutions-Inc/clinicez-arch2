using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Appointments;

public sealed record GetAppointmentByIdQuery(Guid AppointmentId) : IRequest<AppointmentDto>;

public sealed class GetAppointmentByIdQueryHandler : IRequestHandler<GetAppointmentByIdQuery, AppointmentDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IClinicContext? _clinicContext;

    public GetAppointmentByIdQueryHandler(
        IRepository<Appointment> appointmentRepo,
        IClinicContext? clinicContext = null)
    {
        _appointmentRepo = appointmentRepo;
        _clinicContext = clinicContext;
    }

    public async Task<AppointmentDto> Handle(GetAppointmentByIdQuery request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId && !a.IsDeleted, ct);

        if (appointment == null || (_clinicContext != null && _clinicContext.ClinicId != Guid.Empty && appointment.ClinicId != _clinicContext.ClinicId))
        {
            throw new NotFoundException($"Appointment with ID '{request.AppointmentId}' was not found.");
        }

        return AppointmentDto.From(appointment);
    }
}
