using System.Text.Json;
using MediatR;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Enums;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Features.Appointments.Commands.PushClinicAppointments;

public sealed class PushClinicAppointmentsCommandHandler : IRequestHandler<PushClinicAppointmentsCommand, bool>
{
    private readonly IAppointmentRepository _appointmentRepository;
    private readonly IUnitOfWork _unitOfWork;

    public PushClinicAppointmentsCommandHandler(
        IAppointmentRepository appointmentRepository,
        IUnitOfWork unitOfWork)
    {
        _appointmentRepository = appointmentRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> Handle(PushClinicAppointmentsCommand request, CancellationToken cancellationToken)
    {
        var existingAppointments = await _appointmentRepository.GetByPatientAsync(request.PatientId, cancellationToken);
        // Map of existing appointments by ID
        var existingDict = existingAppointments.Where(x => x.ClinicId == request.ClinicId).ToDictionary(x => x.Id);

        foreach (var dto in request.Appointments)
        {
            if (!Guid.TryParse(dto.Id, out var id)) continue;

            if (existingDict.TryGetValue(id, out var appt))
            {
                // Update
                appt.ProviderId = Guid.TryParse(dto.Provider.Id, out var pid) ? pid : Guid.Empty;
                appt.Subject = dto.Provider.Name;
                appt.ServiceType = dto.ServiceType;
                appt.ScheduledAt = DateTime.Parse(dto.ScheduledAt).ToUniversalTime();
                appt.DurationMinutes = dto.DurationMinutes;
                
                if (Enum.TryParse<AppointmentStatus>(dto.Status, true, out var status))
                {
                    appt.Status = status;
                }
                
                appt.Notes = dto.Notes;
                appt.RawJson = JsonSerializer.Serialize(dto);
                appt.CachedAt = DateTime.UtcNow;

                _appointmentRepository.Update(appt);
                existingDict.Remove(id);
            }
            else
            {
                // Insert
                var newAppt = new Appointment
                {
                    Id = id,
                    PatientId = request.PatientId,
                    ClinicId = request.ClinicId,
                    ProviderId = Guid.TryParse(dto.Provider.Id, out var pid2) ? pid2 : Guid.Empty,
                    Subject = dto.Provider.Name,
                    ServiceType = dto.ServiceType,
                    ScheduledAt = DateTime.Parse(dto.ScheduledAt).ToUniversalTime(),
                    DurationMinutes = dto.DurationMinutes,
                    Status = Enum.TryParse<AppointmentStatus>(dto.Status, true, out var s2) ? s2 : AppointmentStatus.Pending,
                    Notes = dto.Notes,
                    AttachedFileIdsJson = "[]",
                    RawJson = JsonSerializer.Serialize(dto),
                    CachedAt = DateTime.UtcNow
                };

                await _appointmentRepository.AddAsync(newAppt, cancellationToken);
            }
        }

        // We don't necessarily delete the remaining items because maybe they were just not pushed this time,
        // or if it's a full sync, we could delete them.
        // Assuming Clinic Dashboard pushes ALL active/future appointments, we might want to delete missing ones?
        // Let's assume it pushes ALL. So we delete the ones not in the push payload?
        // Wait, what if it's a partial push? Let's leave them for now to be safe.

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return true;
    }
}
