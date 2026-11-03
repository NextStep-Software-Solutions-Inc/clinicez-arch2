using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetVitalsHistory;

public sealed record GetVitalsHistoryQuery(Guid PatientId, int Take = 20) : IRequest<IReadOnlyList<VitalSignsDto>>;

public sealed class GetVitalsHistoryQueryHandler : IRequestHandler<GetVitalsHistoryQuery, IReadOnlyList<VitalSignsDto>>
{
    private readonly IPatientRepository _patientRepository;

    public GetVitalsHistoryQueryHandler(IPatientRepository patientRepository)
    {
        _patientRepository = patientRepository;
    }

    public async Task<IReadOnlyList<VitalSignsDto>> Handle(
        GetVitalsHistoryQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

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
            v.BloodGlucoseMgDl,
            null,
            null,
            v.CreatedAt,
            v.UpdatedAt,
            v.BloodGlucoseMgDl,
            v.SleepHours
        )).ToList();
    }
}
