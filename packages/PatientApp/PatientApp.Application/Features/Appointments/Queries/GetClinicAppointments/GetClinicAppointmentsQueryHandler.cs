using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Common.Interfaces;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Appointments.Queries.GetClinicAppointments;

public sealed class GetClinicAppointmentsQueryHandler
    : IRequestHandler<GetClinicAppointmentsQuery, ClinicAppointmentsResponse>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IClinicDashboardService _clinicDashboardService;

    public GetClinicAppointmentsQueryHandler(
        IPatientRepository patientRepository,
        IClinicDashboardService clinicDashboardService)
    {
        _patientRepository = patientRepository;
        _clinicDashboardService = clinicDashboardService;
    }

    public async Task<ClinicAppointmentsResponse> Handle(
        GetClinicAppointmentsQuery request,
        CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        return await _clinicDashboardService.GetAppointmentsAsync(
            request.ClinicBaseUrl,
            patient.Id,
            request.BearerToken,
            cancellationToken);
    }
}
