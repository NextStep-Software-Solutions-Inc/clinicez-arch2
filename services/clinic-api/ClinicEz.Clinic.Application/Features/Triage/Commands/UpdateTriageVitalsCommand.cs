using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Triage.Commands;

public sealed record UpdateTriageVitalsCommand(
    Guid QueueItemId,
    Guid? NurseId,
    string? RecordedByNurseName,
    int? SystolicBp,
    int? DiastolicBp,
    int? HeartRateBpm,
    decimal? TemperatureCelsius,
    int? RespiratoryRateBreathsPerMin,
    decimal? OxygenSaturationPercent,
    decimal? HeightCm,
    decimal? WeightKg,
    int? PainScore,
    string? Notes,
    string? VisualAcuityLeft = null,
    string? VisualAcuityRight = null,
    decimal? HeadCircumferenceCm = null,
    decimal? MidUpperArmCircumferenceCm = null,
    bool? IsMeasuredRecumbent = null,
    decimal? ZScoreWeightForAge = null,
    decimal? ZScoreLengthForAge = null,
    decimal? ZScoreWeightForLength = null,
    string? GrowthZScoreCategory = null,
    string? GrowthZScoreCode = null,
    string? PhilHealthZScoreCategory = null,
    string? PhilHealthZScoreCode = null,
    decimal? WaistCircumferenceCm = null,
    decimal? HipCircumferenceCm = null,
    decimal? BodyLengthCm = null,
    decimal? SkinfoldThicknessMm = null,
    decimal? LimbsCircumferenceCm = null,
    string? PreAssessmentNotes = null,
    string? PreAssessmentRemarks = null,
    string? TriageAcuityReason = null,
    QueuePriority? Priority = null,
    bool ClearHeight = false,
    bool ClearWeight = false) : IRequest<TriageVitalsDto>;

public sealed class UpdateTriageVitalsCommandValidator : AbstractValidator<UpdateTriageVitalsCommand>
{
    public UpdateTriageVitalsCommandValidator()
    {
        RuleFor(x => x.QueueItemId).NotEmpty();
        When(x => x.Priority.HasValue, () => RuleFor(x => x.Priority!.Value).IsInEnum());
        When(x => x.SystolicBp.HasValue, () => RuleFor(x => x.SystolicBp).InclusiveBetween(50, 300));
        When(x => x.DiastolicBp.HasValue, () => RuleFor(x => x.DiastolicBp).InclusiveBetween(30, 200));
        When(x => x.HeartRateBpm.HasValue, () => RuleFor(x => x.HeartRateBpm).InclusiveBetween(30, 250));
        When(x => x.TemperatureCelsius.HasValue, () => RuleFor(x => x.TemperatureCelsius).InclusiveBetween(30m, 45m));
        When(x => x.OxygenSaturationPercent.HasValue, () => RuleFor(x => x.OxygenSaturationPercent).InclusiveBetween(50m, 100m));
        When(x => x.PainScore.HasValue, () => RuleFor(x => x.PainScore).InclusiveBetween(0, 10));
    }
}

public sealed class UpdateTriageVitalsCommandHandler : IRequestHandler<UpdateTriageVitalsCommand, TriageVitalsDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<TriageVitals> _vitalsRepository;
    private readonly IRepository<ClinicPatient> _patientRepository;
    private readonly Application.Common.Interfaces.IWhoZScoreCalculator? _zScoreCalculator;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdateTriageVitalsCommandHandler(
        IRepository<QueueItem> queueRepository,
        IRepository<TriageVitals> vitalsRepository,
        IRepository<ClinicPatient> patientRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        Application.Common.Interfaces.IWhoZScoreCalculator? zScoreCalculator = null)
    {
        _queueRepository = queueRepository;
        _vitalsRepository = vitalsRepository;
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _zScoreCalculator = zScoreCalculator;
    }

    public async Task<TriageVitalsDto> Handle(UpdateTriageVitalsCommand request, CancellationToken cancellationToken)
    {
        var queueItem = await _queueRepository.Query(q => q.Id == request.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.TriageVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (queueItem == null)
        {
            throw new NotFoundException($"Queue ticket '{request.QueueItemId}' not found in this clinic.");
        }

        var vitals = queueItem.TriageVitals;
        if (vitals == null)
        {
            throw new NotFoundException($"No triage vitals found to update for queue ticket '{request.QueueItemId}'.");
        }

        // Nurse attribution
        if (request.NurseId.HasValue)
        {
            vitals.NurseId = request.NurseId.Value;
        }

        if (request.RecordedByNurseName != null)
        {
            vitals.RecordedByNurseName = string.IsNullOrWhiteSpace(request.RecordedByNurseName)
                ? null
                : request.RecordedByNurseName.Trim();
        }

        // Vital Signs - partial update preserves untouched fields when null
        if (request.SystolicBp.HasValue) vitals.SystolicBp = request.SystolicBp.Value;
        if (request.DiastolicBp.HasValue) vitals.DiastolicBp = request.DiastolicBp.Value;
        if (request.HeartRateBpm.HasValue) vitals.HeartRateBpm = request.HeartRateBpm.Value;
        if (request.TemperatureCelsius.HasValue) vitals.TemperatureCelsius = request.TemperatureCelsius.Value;
        if (request.RespiratoryRateBreathsPerMin.HasValue) vitals.RespiratoryRateBreathsPerMin = request.RespiratoryRateBreathsPerMin.Value;
        if (request.OxygenSaturationPercent.HasValue) vitals.OxygenSaturationPercent = request.OxygenSaturationPercent.Value;
        if (request.PainScore.HasValue) vitals.PainScore = request.PainScore.Value;

        // Optional text fields: empty string clears to null; null preserves existing value
        vitals.Notes = UpdateTextField(request.Notes, vitals.Notes);
        vitals.VisualAcuityLeft = UpdateTextField(request.VisualAcuityLeft, vitals.VisualAcuityLeft);
        vitals.VisualAcuityRight = UpdateTextField(request.VisualAcuityRight, vitals.VisualAcuityRight);
        vitals.PreAssessmentNotes = UpdateTextField(request.PreAssessmentNotes, vitals.PreAssessmentNotes);
        vitals.PreAssessmentRemarks = UpdateTextField(request.PreAssessmentRemarks, vitals.PreAssessmentRemarks);
        vitals.TriageAcuityReason = UpdateTextField(request.TriageAcuityReason, vitals.TriageAcuityReason);

        // Pediatric & adult anthropometrics
        if (request.HeadCircumferenceCm.HasValue)
            vitals.HeadCircumferenceCm = request.HeadCircumferenceCm.Value <= 0 ? null : request.HeadCircumferenceCm.Value;

        if (request.MidUpperArmCircumferenceCm.HasValue)
            vitals.MidUpperArmCircumferenceCm = request.MidUpperArmCircumferenceCm.Value <= 0 ? null : request.MidUpperArmCircumferenceCm.Value;

        if (request.IsMeasuredRecumbent.HasValue)
            vitals.IsMeasuredRecumbent = request.IsMeasuredRecumbent.Value;

        if (request.WaistCircumferenceCm.HasValue)
            vitals.WaistCircumferenceCm = request.WaistCircumferenceCm.Value <= 0 ? null : request.WaistCircumferenceCm.Value;

        if (request.HipCircumferenceCm.HasValue)
            vitals.HipCircumferenceCm = request.HipCircumferenceCm.Value <= 0 ? null : request.HipCircumferenceCm.Value;

        if (request.BodyLengthCm.HasValue)
            vitals.BodyLengthCm = request.BodyLengthCm.Value <= 0 ? null : request.BodyLengthCm.Value;

        if (request.SkinfoldThicknessMm.HasValue)
            vitals.SkinfoldThicknessMm = request.SkinfoldThicknessMm.Value <= 0 ? null : request.SkinfoldThicknessMm.Value;

        if (request.LimbsCircumferenceCm.HasValue)
            vitals.LimbsCircumferenceCm = request.LimbsCircumferenceCm.Value <= 0 ? null : request.LimbsCircumferenceCm.Value;

        // Height, Weight, BMI & WHO Z-scores
        bool heightCleared = request.ClearHeight || (request.HeightCm.HasValue && request.HeightCm.Value <= 0);
        bool weightCleared = request.ClearWeight || (request.WeightKg.HasValue && request.WeightKg.Value <= 0);

        bool heightModified = heightCleared || request.HeightCm.HasValue;
        bool weightModified = weightCleared || request.WeightKg.HasValue;

        if (heightCleared)
        {
            vitals.HeightCm = null;
        }
        else if (request.HeightCm.HasValue)
        {
            vitals.HeightCm = request.HeightCm.Value;
        }

        if (weightCleared)
        {
            vitals.WeightKg = null;
        }
        else if (request.WeightKg.HasValue)
        {
            vitals.WeightKg = request.WeightKg.Value;
        }

        var effectiveHeight = vitals.HeightCm;
        var effectiveWeight = vitals.WeightKg;

        if (heightCleared || weightCleared || effectiveHeight is null or <= 0 || effectiveWeight is null or <= 0)
        {
            // Height or weight missing/cleared: BMI and WHO Z-scores MUST be cleared!
            vitals.Bmi = null;
            vitals.ZScoreWeightForAge = null;
            vitals.ZScoreLengthForAge = null;
            vitals.ZScoreWeightForLength = null;
            vitals.GrowthZScoreCategory = null;
            vitals.GrowthZScoreCode = null;
        }
        else
        {
            // Both height and weight are positive
            if (heightModified || weightModified)
            {
                var heightInMeters = effectiveHeight.Value / 100m;
                vitals.Bmi = Math.Round(effectiveWeight.Value / (heightInMeters * heightInMeters), 2);

                // Recalculate WHO Z-scores
                var zWeightForAge = request.ZScoreWeightForAge;
                var zLengthForAge = request.ZScoreLengthForAge;
                var zWeightForLength = request.ZScoreWeightForLength;
                var zCategory = request.GrowthZScoreCategory ?? request.PhilHealthZScoreCategory;
                var zCode = request.GrowthZScoreCode ?? request.PhilHealthZScoreCode;

                var effectiveLengthHeight = vitals.BodyLengthCm ?? effectiveHeight;
                if (zWeightForAge == null && _zScoreCalculator != null)
                {
                    var patient = await _patientRepository.Query(p => p.Id == queueItem.PatientId && p.ClinicId == _clinicContext.ClinicId)
                        .FirstOrDefaultAsync(cancellationToken);
                    if (patient != null)
                    {
                        var evaluation = _zScoreCalculator.Calculate(
                            patient.DateOfBirth,
                            patient.Gender,
                            effectiveLengthHeight.Value,
                            effectiveWeight.Value,
                            vitals.IsMeasuredRecumbent || vitals.BodyLengthCm.HasValue);

                        if (evaluation != null)
                        {
                            zWeightForAge = evaluation.WeightForAgeZScore;
                            zLengthForAge = evaluation.HeightForAgeZScore;
                            zWeightForLength = evaluation.WeightForHeightZScore;
                            zCategory = evaluation.GrowthZScoreCategory;
                            zCode = evaluation.GrowthZScoreCode;
                        }
                    }
                }

                vitals.ZScoreWeightForAge = zWeightForAge;
                vitals.ZScoreLengthForAge = zLengthForAge;
                vitals.ZScoreWeightForLength = zWeightForLength;
                vitals.GrowthZScoreCategory = zCategory;
                vitals.GrowthZScoreCode = zCode;
            }
            else
            {
                // Height and weight were not modified: check for explicit Z-scores or category in request
                if (request.ZScoreWeightForAge.HasValue) vitals.ZScoreWeightForAge = request.ZScoreWeightForAge.Value;
                if (request.ZScoreLengthForAge.HasValue) vitals.ZScoreLengthForAge = request.ZScoreLengthForAge.Value;
                if (request.ZScoreWeightForLength.HasValue) vitals.ZScoreWeightForLength = request.ZScoreWeightForLength.Value;

                if (request.GrowthZScoreCategory != null || request.PhilHealthZScoreCategory != null)
                {
                    var cat = request.GrowthZScoreCategory ?? request.PhilHealthZScoreCategory;
                    vitals.GrowthZScoreCategory = string.IsNullOrWhiteSpace(cat) ? null : cat.Trim();
                }

                if (request.GrowthZScoreCode != null || request.PhilHealthZScoreCode != null)
                {
                    var code = request.GrowthZScoreCode ?? request.PhilHealthZScoreCode;
                    vitals.GrowthZScoreCode = string.IsNullOrWhiteSpace(code) ? null : code.Trim();
                }
            }
        }

        vitals.UpdatedAt = DateTime.UtcNow;
        vitals.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Nurse";

        _vitalsRepository.Update(vitals);

        bool queueItemModified = false;

        // Persist priority change to PostgreSQL if provided
        if (request.Priority.HasValue && queueItem.Priority != request.Priority.Value)
        {
            queueItem.Priority = request.Priority.Value;
            queueItemModified = true;
        }

        // Transition queue status from Waiting to Triaged; preserve non-Waiting statuses
        if (queueItem.Status == QueueStatus.Waiting)
        {
            queueItem.Status = QueueStatus.Triaged;
            queueItemModified = true;
        }

        if (queueItemModified)
        {
            queueItem.UpdatedAt = DateTime.UtcNow;
            queueItem.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Nurse";
            _queueRepository.Update(queueItem);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

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

    private static string? UpdateTextField(string? requestValue, string? existingValue)
    {
        if (requestValue == null) return existingValue;
        return string.IsNullOrWhiteSpace(requestValue) ? null : requestValue.Trim();
    }
}
