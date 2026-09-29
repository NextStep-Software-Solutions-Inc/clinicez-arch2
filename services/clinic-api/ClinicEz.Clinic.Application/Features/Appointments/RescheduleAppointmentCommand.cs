using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Appointments;

public sealed record RescheduleAppointmentCommand(
    Guid Id,
    DateTime NewScheduledAt,
    int? DurationMinutes = null,
    string? Reason = null) : IRequest<AppointmentDto>;

public sealed class RescheduleAppointmentCommandHandler : IRequestHandler<RescheduleAppointmentCommand, AppointmentDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IUnitOfWork _unitOfWork;

    public RescheduleAppointmentCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<AppointmentDto> Handle(RescheduleAppointmentCommand request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.Id, ct);

        if (appointment == null)
        {
            throw new KeyNotFoundException($"Appointment with ID {request.Id} was not found.");
        }

        appointment.ScheduledAt = request.NewScheduledAt.ToUniversalTime();
        if (request.DurationMinutes.HasValue && request.DurationMinutes.Value > 0)
        {
            appointment.DurationMinutes = request.DurationMinutes.Value;
        }

        if (!string.IsNullOrWhiteSpace(request.Reason))
        {
            appointment.Notes = string.IsNullOrWhiteSpace(appointment.Notes)
                ? $"Rescheduled: {request.Reason}"
                : $"{appointment.Notes} | Rescheduled: {request.Reason}";
        }

        appointment.UpdatedAt = DateTime.UtcNow;
        appointment.UpdatedBy = "ClinicStaff";

        await _unitOfWork.SaveChangesAsync(ct);

        return new AppointmentDto(
            appointment.Id,
            appointment.TenantId,
            appointment.ClinicId,
            appointment.DraftId,
            appointment.PatientId,
            appointment.PatientName,
            appointment.DoctorId,
            appointment.DoctorName,
            appointment.ScheduledAt,
            appointment.DurationMinutes,
            appointment.Status,
            appointment.ServiceType,
            appointment.Reason,
            appointment.Notes,
            appointment.CreatedAt);
    }
}
