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
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
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
    private readonly IAppointmentNotificationDispatcher? _dispatcher;
    private readonly IInteropPublisher? _publisher;

    public CancelAppointmentCommandHandler(
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

        if (_dispatcher != null)
        {
            await _dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Cancelled, ct);
            await _dispatcher.DispatchStaffNotificationAsync(appointment, "cancelled", ct);
        }

        if (_publisher != null)
        {
            var tenantId = appointment.TenantId ?? string.Empty;
            var grantId = CommsGrantIdGenerator.Create(tenantId, appointment.ClinicId.ToString(), "Appointment", appointment.Id.ToString());
            var from = Party.ForFacility(tenantId, appointment.ClinicId.ToString(), FacilityType.Clinic);
            var to = Party.ForFacility(tenantId, appointment.ClinicId.ToString(), FacilityType.Clinic, service: InteropServices.Comms);
            var revokePayload = new CommsEligibilityRevokedPayload(
                GrantId: grantId,
                TenantId: tenantId,
                FacilityId: appointment.ClinicId.ToString(),
                PatientId: appointment.PatientId,
                Reason: request.CancellationReason ?? "Appointment cancelled",
                RevokedAtUtc: DateTime.UtcNow,
                Version: 2);
            _publisher.Enqueue(InteropTypes.CommsEligibilityRevoked, from, to, correlationId: grantId, revokePayload);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return AppointmentDto.From(appointment);
    }
}
