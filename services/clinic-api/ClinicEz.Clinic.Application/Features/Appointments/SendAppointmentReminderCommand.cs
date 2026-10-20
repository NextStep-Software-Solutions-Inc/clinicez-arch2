using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Appointments;

public sealed record SendAppointmentReminderCommand(Guid AppointmentId) : IRequest<AppointmentDto>;

public sealed class SendAppointmentReminderCommandHandler : IRequestHandler<SendAppointmentReminderCommand, AppointmentDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext? _clinicContext;
    private readonly IAppointmentNotificationDispatcher? _dispatcher;
    private readonly ILogger<SendAppointmentReminderCommandHandler>? _logger;

    public SendAppointmentReminderCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext? clinicContext = null,
        IAppointmentNotificationDispatcher? dispatcher = null,
        ILogger<SendAppointmentReminderCommandHandler>? logger = null)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _dispatcher = dispatcher;
        _logger = logger;
    }

    public async Task<AppointmentDto> Handle(SendAppointmentReminderCommand request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId, ct);

        if (appointment == null || (_clinicContext != null && _clinicContext.ClinicId != Guid.Empty && appointment.ClinicId != _clinicContext.ClinicId))
        {
            throw new NotFoundException($"Appointment with ID '{request.AppointmentId}' was not found.");
        }

        if (appointment.Status is AppointmentStatus.Cancelled or AppointmentStatus.Completed)
        {
            throw new InvalidOperationException($"Cannot send reminder for an appointment with status '{appointment.Status}'.");
        }

        if (_dispatcher != null)
        {
            await _dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.ManualReminder, ct);
        }

        var now = DateTime.UtcNow;
        appointment.LastReminderSentAt = now;
        appointment.LastReminderType = "manual";
        appointment.UpdatedAt = now;
        appointment.UpdatedBy = _clinicContext?.StaffName ?? "ClinicStaff";

        await _unitOfWork.SaveChangesAsync(ct);

        _logger?.LogInformation(
            "Manual appointment reminder dispatched for appointment {AppointmentId} at {TimestampUtc}.",
            appointment.Id, now);

        return AppointmentDto.From(appointment);
    }
}
