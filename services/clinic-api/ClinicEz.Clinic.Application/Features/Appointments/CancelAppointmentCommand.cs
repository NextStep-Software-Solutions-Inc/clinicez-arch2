using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Appointments;

public sealed record CancelAppointmentCommand(
    Guid Id,
    string? CancellationReason = null) : IRequest<AppointmentDto>;

public sealed class CancelAppointmentCommandHandler : IRequestHandler<CancelAppointmentCommand, AppointmentDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IUnitOfWork _unitOfWork;

    public CancelAppointmentCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<AppointmentDto> Handle(CancelAppointmentCommand request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.Id, ct);

        if (appointment == null)
        {
            throw new KeyNotFoundException($"Appointment with ID {request.Id} was not found.");
        }

        appointment.Status = AppointmentStatus.Cancelled;
        if (!string.IsNullOrWhiteSpace(request.CancellationReason))
        {
            appointment.Notes = string.IsNullOrWhiteSpace(appointment.Notes)
                ? $"Cancelled: {request.CancellationReason}"
                : $"{appointment.Notes} | Cancelled: {request.CancellationReason}";
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
