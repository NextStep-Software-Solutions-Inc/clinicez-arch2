using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
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

public sealed record MarkAppointmentNoShowCommand(
    Guid Id,
    string? Reason = null) : IRequest<AppointmentDto>;

public sealed class MarkAppointmentNoShowCommandHandler : IRequestHandler<MarkAppointmentNoShowCommand, AppointmentDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext? _clinicContext;
    private readonly IInteropPublisher? _publisher;
    private readonly TimeProvider? _timeProvider;
    private readonly IRepository<Patient>? _patientRepo;
    private readonly ICommsEligibilityPublisher? _eligibilityPublisher;

    public MarkAppointmentNoShowCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext? clinicContext = null,
        IInteropPublisher? publisher = null,
        TimeProvider? timeProvider = null,
        IRepository<Patient>? patientRepo = null,
        ICommsEligibilityPublisher? eligibilityPublisher = null)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _timeProvider = timeProvider;
        _patientRepo = patientRepo;
        _eligibilityPublisher = eligibilityPublisher;
    }

    public async Task<AppointmentDto> Handle(MarkAppointmentNoShowCommand request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.Id && !a.IsDeleted, ct);

        if (appointment == null || (_clinicContext != null && _clinicContext.ClinicId != Guid.Empty && appointment.ClinicId != _clinicContext.ClinicId))
        {
            throw new NotFoundException($"Appointment with ID '{request.Id}' was not found.");
        }

        if (appointment.Status is not (AppointmentStatus.Pending or AppointmentStatus.Confirmed))
        {
            throw new ConflictException($"Cannot mark appointment as No-Show from status '{appointment.Status}'.");
        }

        var now = (_timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime;
        appointment.Status = AppointmentStatus.NoShow;

        if (!string.IsNullOrWhiteSpace(request.Reason))
        {
            var trimmedReason = request.Reason.Trim();
            appointment.Notes = string.IsNullOrWhiteSpace(appointment.Notes)
                ? $"No-Show: {trimmedReason}"
                : $"{appointment.Notes} | No-Show: {trimmedReason}";
        }

        appointment.UpdatedAt = now;
        appointment.UpdatedBy = !string.IsNullOrWhiteSpace(_clinicContext?.StaffName)
            ? _clinicContext.StaffName
            : "ClinicStaff";

        var revokeReason = string.IsNullOrWhiteSpace(request.Reason)
            ? "Appointment marked as no-show"
            : request.Reason.Trim();
        var revokeVersion = CommsEligibilityVersions.ForRevoke(now);
        if (_eligibilityPublisher != null)
        {
            await _eligibilityPublisher.EnqueueRevokeAsync(
                appointment.TenantId,
                appointment.ClinicId,
                appointment.PatientId,
                "Appointment",
                appointment.Id.ToString(),
                revokeReason,
                now,
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
                    now,
                    revokeVersion);
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return AppointmentDto.From(appointment);
    }
}
