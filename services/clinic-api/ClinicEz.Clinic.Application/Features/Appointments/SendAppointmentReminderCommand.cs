using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Workspace;
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
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly TimeProvider? _timeProvider;

    public SendAppointmentReminderCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext? clinicContext = null,
        IAppointmentNotificationDispatcher? dispatcher = null,
        ILogger<SendAppointmentReminderCommandHandler>? logger = null,
        IRepository<FacilitySettings>? settingsRepo = null,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        TimeProvider? timeProvider = null)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _dispatcher = dispatcher;
        _logger = logger;
        _settingsRepo = settingsRepo;
        _workspaceProfiles = workspaceProfiles;
        _timeProvider = timeProvider;
    }

    public async Task<AppointmentDto> Handle(SendAppointmentReminderCommand request, CancellationToken ct)
    {
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId && !a.IsDeleted, ct);

        if (appointment == null || (_clinicContext != null && _clinicContext.ClinicId != Guid.Empty && appointment.ClinicId != _clinicContext.ClinicId))
        {
            throw new NotFoundException($"Appointment with ID '{request.AppointmentId}' was not found.");
        }

        if (appointment.Status is AppointmentStatus.Cancelled or AppointmentStatus.Completed or AppointmentStatus.NoShow)
        {
            throw new ValidationException($"Cannot send reminder for an appointment with status '{appointment.Status}'.");
        }

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query().FirstOrDefaultAsync(s => s.ClinicId == appointment.ClinicId, ct)
            : null;

        var tenantId = !string.IsNullOrWhiteSpace(appointment.TenantId)
            ? appointment.TenantId
            : _clinicContext?.TenantId;

        var workspaceProfile = (_workspaceProfiles != null && !string.IsNullOrWhiteSpace(tenantId))
            ? await _workspaceProfiles.GetAsync(tenantId, ct)
            : null;

        var effectiveTimeZoneId = ClinicTimeZoneResolver.ResolveEffectiveTimeZoneId(settings, workspaceProfile);
        var clinicTimeZone = ClinicTimeZoneResolver.ResolveTimeZone(effectiveTimeZoneId);

        var now = (_timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime;
        var scheduledUtc = appointment.ScheduledAt.Kind switch
        {
            DateTimeKind.Utc => appointment.ScheduledAt,
            DateTimeKind.Local => appointment.ScheduledAt.ToUniversalTime(),
            _ => DateTime.SpecifyKind(appointment.ScheduledAt, DateTimeKind.Utc)
        };

        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(now, clinicTimeZone);
        var scheduledLocal = TimeZoneInfo.ConvertTimeFromUtc(scheduledUtc, clinicTimeZone);

        if (scheduledLocal.Date < nowLocal.Date)
        {
            throw new ValidationException("Cannot send reminder for a past-date appointment.");
        }

        if (_dispatcher != null)
        {
            await _dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.ManualReminder, ct);
        }

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
