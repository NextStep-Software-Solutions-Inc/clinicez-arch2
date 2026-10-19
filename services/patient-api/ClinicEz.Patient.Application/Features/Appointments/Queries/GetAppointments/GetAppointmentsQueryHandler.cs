using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
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

            ClinicAppointmentSnapshotDto? clinicDto = null;
            if (!string.IsNullOrWhiteSpace(appt.RawJson))
            {
                try
                {
                    clinicDto = System.Text.Json.JsonSerializer.Deserialize<ClinicAppointmentSnapshotDto>(
                        appt.RawJson,
                        new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                }
                catch
                {
                    // Ignore malformed rawJson fallback
                }
            }

            dtos.Add(new AppointmentDto(
                appt.Id,
                appt.ClinicId,
                clinic?.Name ?? clinicDto?.ClinicName ?? "Unknown Clinic",
                new AppointmentProviderSnapshot(
                    appt.ProviderId,
                    provider?.Name ?? clinicDto?.Provider?.Name ?? "Unknown Provider",
                    provider?.Specialty ?? clinicDto?.Provider?.Specialty,
                    provider?.AvatarUrl ?? clinicDto?.Provider?.AvatarUrl
                ),
                appt.ServiceType ?? clinicDto?.ServiceType,
                appt.ScheduledAt.ToString("O"),
                appt.DurationMinutes,
                appt.Status.ToString(),
                appt.Notes,
                appt.Subject ?? clinicDto?.Subject,
                appt.ChiefComplaint ?? clinicDto?.ChiefComplaint,
                clinicDto?.ClinicalAssessment,
                clinicDto?.DoctorPlan,
                clinicDto?.PrescriptionsSummary,
                clinicDto?.PrescriptionPublicVerificationUrl
            ));
        }

        return new AppointmentsResponse(dtos, dtos.Count);
    }
}
