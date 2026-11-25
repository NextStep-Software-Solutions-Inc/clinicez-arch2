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
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Appointments;

public sealed record RescheduleAppointmentCommand(
    Guid Id,
    DateTime NewScheduledAt,
    int? DurationMinutes = null,
    string? Reason = null) : IRequest<AppointmentDto>;

public sealed class RescheduleAppointmentCommandValidator : AbstractValidator<RescheduleAppointmentCommand>
{
    private readonly TimeProvider _timeProvider;

    public RescheduleAppointmentCommandValidator(TimeProvider? timeProvider = null)
    {
        _timeProvider = timeProvider ?? TimeProvider.System;

        RuleFor(x => x.Id)
            .NotEmpty()
            .WithMessage("Appointment ID is required.");

        When(x => x.DurationMinutes.HasValue, () =>
        {
            RuleFor(x => x.DurationMinutes!.Value)
                .GreaterThan(0)
                .OverridePropertyName(nameof(RescheduleAppointmentCommand.DurationMinutes))
                .WithMessage("Duration must be greater than 0 minutes.");
        });

        RuleFor(x => x.NewScheduledAt)
            .Cascade(CascadeMode.Stop)
            .NotEqual(default(DateTime))
            .WithMessage("New scheduled date and time is required.")
            .Must(dt => !AppointmentScheduleValidation.IsInPast(dt, _timeProvider))
            .WithMessage("Cannot reschedule an appointment to a time that has already passed.");
    }
}

public sealed class RescheduleAppointmentCommandHandler : IRequestHandler<RescheduleAppointmentCommand, AppointmentDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAppointmentNotificationDispatcher? _dispatcher;
    private readonly IInteropPublisher? _publisher;
    private readonly IRepository<Patient>? _patientRepo;
    private readonly ICommsEligibilityPublisher? _eligibilityPublisher;

    public RescheduleAppointmentCommandHandler(
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

        var newStartUtc = AppointmentScheduleValidation.NormalizeToUtc(request.NewScheduledAt);
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
        appointment.StaffPreSlotNotifiedAt = null;
        appointment.StaffOverdueNotifiedAt = null;

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

        var grantNow = DateTime.UtcNow;
        var grantEnd = (newStartUtc > grantNow ? newStartUtc : grantNow).AddDays(7);
        var grantVersion = CommsEligibilityVersions.ForUpdate(grantNow);
        if (_eligibilityPublisher != null)
        {
            await _eligibilityPublisher.EnqueueGrantAsync(
                appointment.TenantId,
                appointment.ClinicId,
                appointment.PatientId,
                "Appointment",
                appointment.Id.ToString(),
                grantNow,
                grantEnd,
                grantVersion,
                ct: ct);
        }
        else if (_publisher != null)
        {
            var cloudPatientId = await CommsEligibilityOutboxHelper.ResolveCloudPatientIdAsync(
                _patientRepo, appointment.ClinicId, appointment.PatientId, ct);
            if (cloudPatientId.HasValue)
            {
                CommsEligibilityOutboxHelper.EnqueueGrant(
                    _publisher,
                    appointment.TenantId ?? string.Empty,
                    appointment.ClinicId,
                    cloudPatientId.Value,
                    "Appointment",
                    appointment.Id.ToString(),
                    grantNow,
                    grantEnd,
                    grantVersion);
            }
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
