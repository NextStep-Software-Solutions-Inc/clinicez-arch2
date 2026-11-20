using System;
using System.Threading;
using System.Threading.Tasks;
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

    public MarkAppointmentNoShowCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext? clinicContext = null,
        IInteropPublisher? publisher = null,
        TimeProvider? timeProvider = null)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _timeProvider = timeProvider;
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
                Reason: string.IsNullOrWhiteSpace(request.Reason) ? "Appointment marked as no-show" : request.Reason.Trim(),
                RevokedAtUtc: now,
                Version: 2);
            _publisher.Enqueue(InteropTypes.CommsEligibilityRevoked, from, to, correlationId: grantId, revokePayload);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return AppointmentDto.From(appointment);
    }
}
