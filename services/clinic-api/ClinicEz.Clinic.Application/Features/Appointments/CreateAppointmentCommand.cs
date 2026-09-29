using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;

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

    public CreateAppointmentCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _appointmentRepo = appointmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<AppointmentDto> Handle(CreateAppointmentCommand request, CancellationToken ct)
    {
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            DoctorId = request.DoctorId,
            DoctorName = request.DoctorName?.Trim(),
            ScheduledAt = request.ScheduledAt.ToUniversalTime(),
            DurationMinutes = request.DurationMinutes > 0 ? request.DurationMinutes : 30,
            Status = AppointmentStatus.Confirmed,
            ServiceType = request.ServiceType?.Trim(),
            Reason = request.Reason?.Trim(),
            Notes = request.Notes?.Trim(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "ClinicStaff"
        };

        await _appointmentRepo.AddAsync(appointment, ct);
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
