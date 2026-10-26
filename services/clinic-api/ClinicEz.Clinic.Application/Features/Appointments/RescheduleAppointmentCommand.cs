using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
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
    private readonly IAppointmentNotificationDispatcher? _dispatcher;
    private readonly IInteropPublisher? _publisher;

    public RescheduleAppointmentCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork,
        IAppointmentNotificationDispatcher? dispatcher = null,
        IInteropPublisher? publisher = null)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
        _dispatcher = dispatcher;
        _publisher = publisher;
    }

    public async Task<AppointmentDto> Handle(RescheduleAppointmentCommand request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.Id, ct);

        if (appointment == null)
        {
            throw new KeyNotFoundException($"Appointment with ID {request.Id} was not found.");
        }

        var duration = request.DurationMinutes.GetValueOrDefault(appointment.DurationMinutes);
        if (duration <= 0) duration = 30;

        var newStartUtc = request.NewScheduledAt.ToUniversalTime();
        var newEndUtc = newStartUtc.AddMinutes(duration);

        if (appointment.DoctorId.HasValue)
        {
            var hasCollision = await _appointmentRepo.Query()
                .AnyAsync(a =>
                    a.ClinicId == appointment.ClinicId &&
                    a.DoctorId == appointment.DoctorId &&
                    a.Status != AppointmentStatus.Cancelled &&
                    !a.IsDeleted &&
                    a.Id != appointment.Id &&
                    a.ScheduledAt < newEndUtc &&
                    newStartUtc < a.EndTimeUtc, ct);

            if (hasCollision)
            {
                throw new ConflictException("The selected doctor already has an appointment during this time window.");
            }
        }

        appointment.ScheduledAt = newStartUtc;
        appointment.DurationMinutes = duration;
        appointment.EndTimeUtc = newEndUtc;

        // Reset reminder flags so the new slot receives advance reminders
        appointment.Reminder24hSent = false;
        appointment.Reminder2hSent = false;
        appointment.Reminder24hSentAt = null;
        appointment.Reminder2hSentAt = null;

        if (!string.IsNullOrWhiteSpace(request.Reason))
        {
            appointment.Notes = string.IsNullOrWhiteSpace(appointment.Notes)
                ? $"Rescheduled: {request.Reason}"
                : $"{appointment.Notes} | Rescheduled: {request.Reason}";
        }

        appointment.UpdatedAt = DateTime.UtcNow;
        appointment.UpdatedBy = "ClinicStaff";

        if (_dispatcher != null)
        {
            await _dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Rescheduled, ct);
            await _dispatcher.DispatchStaffNotificationAsync(appointment, "rescheduled", ct);
        }

        if (_publisher != null)
        {
            var tenantId = appointment.TenantId ?? string.Empty;
            var grantId = CommsGrantIdGenerator.Create(tenantId, appointment.ClinicId.ToString(), "Appointment", appointment.Id.ToString());
            var from = Party.ForFacility(tenantId, appointment.ClinicId.ToString(), FacilityType.Clinic);
            var to = Party.ForFacility(tenantId, appointment.ClinicId.ToString(), FacilityType.Clinic, service: InteropServices.Comms);
            var grantPayload = new CommsEligibilityGrantedPayload(
                GrantId: grantId,
                TenantId: tenantId,
                FacilityId: appointment.ClinicId.ToString(),
                FacilityType: "Clinic",
                PatientId: appointment.PatientId,
                ContextType: "Appointment",
                ContextId: appointment.Id.ToString(),
                WindowStartUtc: DateTime.UtcNow,
                WindowEndUtc: newStartUtc.AddDays(7),
                Version: 2);
            _publisher.Enqueue(InteropTypes.CommsEligibilityGranted, from, to, correlationId: grantId, grantPayload);
        }

        try
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23P01" })
        {
            throw new ConflictException("The selected doctor already has an appointment during this time window.", ex);
        }

        return AppointmentDto.From(appointment);
    }
}
