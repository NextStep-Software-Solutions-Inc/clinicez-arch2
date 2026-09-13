using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Appointments.Queries.GetAppointments;

public sealed class GetAppointmentsQueryHandler
    : IRequestHandler<GetAppointmentsQuery, AppointmentsResponse>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IAppointmentRepository _appointmentRepository;
    private readonly IClinicRepository _clinicRepository;

    public GetAppointmentsQueryHandler(
        IPatientRepository patientRepository,
        IAppointmentRepository appointmentRepository,
        IClinicRepository clinicRepository)
    {
        _patientRepository = patientRepository;
        _appointmentRepository = appointmentRepository;
        _clinicRepository = clinicRepository;
    }

    public async Task<AppointmentsResponse> Handle(
        GetAppointmentsQuery request,
        CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var appointments = await _appointmentRepository.GetByPatientAsync(patient.Id, cancellationToken);
        
        var uniqueClinicIds = appointments.Select(a => a.ClinicId).Distinct().ToList();
        var clinics = await _clinicRepository.GetByIdsAsync(uniqueClinicIds, cancellationToken);
        var clinicsDict = clinics.ToDictionary(c => c.Id);

        var dtos = new List<AppointmentDto>(appointments.Count);

        foreach (var appt in appointments)
        {
            clinicsDict.TryGetValue(appt.ClinicId, out var clinic);
            var provider = clinic?.HealthcareProviders.FirstOrDefault(p => p.Id == appt.ProviderId);

            dtos.Add(new AppointmentDto(
                appt.Id,
                appt.ClinicId,
                clinic?.Name ?? "Unknown Clinic",
                new AppointmentProviderSnapshot(
                    appt.ProviderId,
                    provider?.Name ?? "Unknown Provider",
                    provider?.Specialty,
                    provider?.AvatarUrl
                ),
                appt.ServiceType,
                appt.ScheduledAt.ToString("O"),
                appt.DurationMinutes,
                appt.Status.ToString(),
                appt.Notes,
                appt.Subject,
                appt.ChiefComplaint
            ));
        }

        return new AppointmentsResponse(dtos, dtos.Count);
    }
}
