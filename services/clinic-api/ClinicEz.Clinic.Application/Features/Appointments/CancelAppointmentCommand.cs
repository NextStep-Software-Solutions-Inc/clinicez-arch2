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
    private readonly IRepository<Patient>? _patientRepo;
    private readonly ICommsEligibilityPublisher? _eligibilityPublisher;

    public CancelAppointmentCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork,
        IAppointmentNotificationDispatcher? dispatcher = null,
        IInteropPublisher? publisher = null,
        IRepository<Patient>? patientRepo = null,
        ICommsEligibilityPublisher? eligibilityPublisher = null)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
        _dispatcher = dispatcher;
        _publisher = publisher;
        _patientRepo = patientRepo;
        _eligibilityPublisher = eligibilityPublisher;
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

        var revokeNow = DateTime.UtcNow;
        var revokeReason = request.CancellationReason ?? "Appointment cancelled";
        var revokeVersion = CommsEligibilityVersions.ForRevoke(revokeNow);
        if (_eligibilityPublisher != null)
        {
            await _eligibilityPublisher.EnqueueRevokeAsync(
                appointment.TenantId,
                appointment.ClinicId,
                appointment.PatientId,
                "Appointment",
                appointment.Id.ToString(),
                revokeReason,
                revokeNow,
                revokeVersion,
                ct: ct);
        }
        else if (_publisher != null)
        {
            var cloudPatientId = await CommsEligibilityOutboxHelper.ResolveCloudPatientIdAsync(
                _patientRepo, appointment.ClinicId, appointment.PatientId, ct);
            if (cloudPatientId.HasValue)
            {
                CommsEligibilityOutboxHelper.EnqueueRevoke(
                    _publisher,
                    appointment.TenantId ?? string.Empty,
                    appointment.ClinicId,
                    cloudPatientId.Value,
                    "Appointment",
                    appointment.Id.ToString(),
                    revokeReason,
                    revokeNow,
                    revokeVersion);
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return AppointmentDto.From(appointment);
    }
}
