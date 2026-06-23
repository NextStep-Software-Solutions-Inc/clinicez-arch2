using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Appointments.Queries.GetAppointments;

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
        var dtos = new List<AppointmentDto>();

        foreach (var appt in appointments)
        {
            var clinic = await _clinicRepository.GetByIdAsync(appt.ClinicId, cancellationToken);
            dtos.Add(new AppointmentDto(
                appt.Id,
                appt.ClinicId,
                clinic?.Name ?? "Unknown Clinic",
                new AppointmentProviderSnapshot(
                    appt.ProviderId,
                    "Healthcare Provider",
                    null, // specialty
                    null  // avatar
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
