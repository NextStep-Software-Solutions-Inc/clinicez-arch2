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

namespace ClinicEz.Clinic.Application.Features.Appointments;

public sealed record CreateAppointmentCommand(
    Guid PatientId,
    string PatientName,
    Guid? DoctorId,
    string? DoctorName,
    DateTime ScheduledAt,
    int DurationMinutes = 30,
    string? ServiceType = "Consultation",
    string? Reason = null,
    string? Notes = null) : IRequest<AppointmentDto>;

public sealed class CreateAppointmentCommandHandler : IRequestHandler<CreateAppointmentCommand, AppointmentDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IAppointmentNotificationDispatcher? _dispatcher;

    public CreateAppointmentCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IAppointmentNotificationDispatcher? dispatcher = null)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _dispatcher = dispatcher;
    }

    public async Task<AppointmentDto> Handle(CreateAppointmentCommand request, CancellationToken ct)
    {
        var duration = request.DurationMinutes > 0 ? request.DurationMinutes : 30;
        var scheduledStartUtc = request.ScheduledAt.ToUniversalTime();
        var scheduledEndUtc = scheduledStartUtc.AddMinutes(duration);

        if (request.DoctorId.HasValue)
        {
            var hasCollision = await _appointmentRepo.Query()
                .AnyAsync(a =>
                    a.ClinicId == _clinicContext.ClinicId &&
                    a.DoctorId == request.DoctorId &&
                    a.Status != AppointmentStatus.Cancelled &&
                    !a.IsDeleted &&
                    a.ScheduledAt < scheduledEndUtc &&
                    scheduledStartUtc < a.EndTimeUtc, ct);

            if (hasCollision)
            {
                throw new ConflictException("The selected doctor already has an appointment during this time window.");
            }
        }

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            DoctorId = request.DoctorId,
            DoctorName = request.DoctorName?.Trim(),
            ScheduledAt = scheduledStartUtc,
            DurationMinutes = duration,
            EndTimeUtc = scheduledEndUtc,
            Status = AppointmentStatus.Confirmed,
            ServiceType = request.ServiceType?.Trim(),
            Reason = request.Reason?.Trim(),
            Notes = request.Notes?.Trim(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "ClinicStaff"
        };

        try
        {
            await _appointmentRepo.AddAsync(appointment, ct);
            if (_dispatcher != null)
            {
                await _dispatcher.DispatchAlertAsync(appointment, AppointmentAlertKinds.Booked, ct);
                await _dispatcher.DispatchStaffNotificationAsync(appointment, "booked", ct);
            }
            await _unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23P01" })
        {
            throw new ConflictException("The selected doctor already has an appointment during this time window.", ex);
        }

        return AppointmentDto.From(appointment);
    }
}
