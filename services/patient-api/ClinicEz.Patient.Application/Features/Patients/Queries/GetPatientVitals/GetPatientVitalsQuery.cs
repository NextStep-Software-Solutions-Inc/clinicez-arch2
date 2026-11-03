using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientVitals;

public sealed record GetPatientVitalsQuery(Guid PatientId, int Take = 10) : IRequest<IReadOnlyList<VitalSignsDto>>;

public sealed class GetPatientVitalsQueryHandler : IRequestHandler<GetPatientVitalsQuery, IReadOnlyList<VitalSignsDto>>
{
    private readonly IPatientRepository _patientRepository;

    public GetPatientVitalsQueryHandler(IPatientRepository patientRepository)
        => _patientRepository = patientRepository;

    public async Task<IReadOnlyList<VitalSignsDto>> Handle(
        GetPatientVitalsQuery request, CancellationToken cancellationToken)
    {
        var vitals = await _patientRepository.GetRecentVitalsAsync(request.PatientId, request.Take, cancellationToken);
        return vitals.Select(v => new VitalSignsDto(
            v.Id,
            v.PatientId,
            v.ClinicId,
            v.ConsultationId,
            v.RecordedAt,
            v.WeightKg,
            v.HeightCm,
            v.Bmi,
            v.SystolicBp,
            v.DiastolicBp,
            v.HeartRateBpm,
            v.TemperatureCelsius,
            v.OxygenSaturationPercent,
            v.RespiratoryRateBreathsPerMin,
            null,
            null,
            null,
            v.CreatedAt,
            v.UpdatedAt
        )).ToList();
    }
}
