using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Triage.Queries;

public sealed record GetTriageVitalsQuery(Guid QueueItemId) : IRequest<TriageVitalsDto?>;

public sealed class GetTriageVitalsQueryHandler : IRequestHandler<GetTriageVitalsQuery, TriageVitalsDto?>
{
    private readonly IRepository<TriageVitals> _vitalsRepository;
    private readonly IClinicContext _clinicContext;

    public GetTriageVitalsQueryHandler(
        IRepository<TriageVitals> vitalsRepository,
        IClinicContext clinicContext)
    {
        _vitalsRepository = vitalsRepository;
        _clinicContext = clinicContext;
    }

    public async Task<TriageVitalsDto?> Handle(GetTriageVitalsQuery request, CancellationToken cancellationToken)
    {
        var vitals = await _vitalsRepository.Query(v => 
            v.QueueItemId == request.QueueItemId && 
            v.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (vitals == null) return null;

        return new TriageVitalsDto(
            vitals.Id,
            vitals.TenantId,
            vitals.ClinicId,
            vitals.QueueItemId,
            vitals.PatientId,
            vitals.NurseId,
            vitals.RecordedByNurseName,
            vitals.RecordedAt,
            vitals.SystolicBp,
            vitals.DiastolicBp,
            vitals.HeartRateBpm,
            vitals.TemperatureCelsius,
            vitals.RespiratoryRateBreathsPerMin,
            vitals.OxygenSaturationPercent,
            vitals.HeightCm,
            vitals.WeightKg,
            vitals.Bmi,
            vitals.PainScore,
            vitals.Notes,
            vitals.VisualAcuityLeft,
            vitals.VisualAcuityRight,
            vitals.HeadCircumferenceCm,
            vitals.MidUpperArmCircumferenceCm,
            vitals.IsMeasuredRecumbent,
            vitals.ZScoreWeightForAge,
            vitals.ZScoreLengthForAge,
            vitals.ZScoreWeightForLength,
            vitals.GrowthZScoreCategory,
            vitals.GrowthZScoreCode,
            vitals.WaistCircumferenceCm,
            vitals.HipCircumferenceCm,
            vitals.BodyLengthCm,
            vitals.SkinfoldThicknessMm,
            vitals.LimbsCircumferenceCm,
            vitals.PreAssessmentNotes,
            vitals.PreAssessmentRemarks,
            vitals.TriageAcuityReason);
    }
}
