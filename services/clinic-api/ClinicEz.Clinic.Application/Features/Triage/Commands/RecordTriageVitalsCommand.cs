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

public sealed record RecordTriageVitalsCommand(
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
    bool IsMeasuredRecumbent = false,
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
    QueuePriority? Priority = null) : IRequest<TriageVitalsDto>;

public sealed class RecordTriageVitalsCommandValidator : AbstractValidator<RecordTriageVitalsCommand>
{
    public RecordTriageVitalsCommandValidator()
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

public sealed class RecordTriageVitalsCommandHandler : IRequestHandler<RecordTriageVitalsCommand, TriageVitalsDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<TriageVitals> _vitalsRepository;
    private readonly IRepository<ClinicPatient> _patientRepository;
    private readonly Application.Common.Interfaces.IWhoZScoreCalculator? _zScoreCalculator;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public RecordTriageVitalsCommandHandler(
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

    public async Task<TriageVitalsDto> Handle(RecordTriageVitalsCommand request, CancellationToken cancellationToken)
    {
        var queueItem = await _queueRepository.Query(q => q.Id == request.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.TriageVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (queueItem == null)
        {
            throw new NotFoundException($"Queue ticket '{request.QueueItemId}' not found in this clinic.");
        }

        // Automated BMI Calculation: weight (kg) / [height (m)]^2
        decimal? calculatedBmi = null;
        if (request.HeightCm is > 0 && request.WeightKg is > 0)
        {
            var heightInMeters = request.HeightCm.Value / 100m;
            calculatedBmi = Math.Round(request.WeightKg.Value / (heightInMeters * heightInMeters), 2);
        }

        // Optional WHO Z-score evaluation for pediatric patients
        var zWeightForAge = request.ZScoreWeightForAge;
        var zLengthForAge = request.ZScoreLengthForAge;
        var zWeightForLength = request.ZScoreWeightForLength;
        var zCategory = request.GrowthZScoreCategory ?? request.PhilHealthZScoreCategory;
        var zCode = request.GrowthZScoreCode ?? request.PhilHealthZScoreCode;

        var effectiveLengthHeight = request.BodyLengthCm ?? request.HeightCm;
        if (zWeightForAge == null && _zScoreCalculator != null && effectiveLengthHeight is > 0 && request.WeightKg is > 0)
        {
            var patient = await _patientRepository.Query(p => p.Id == queueItem.PatientId && p.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (patient != null)
            {
                var evaluation = _zScoreCalculator.Calculate(
                    patient.DateOfBirth,
                    patient.Gender,
                    effectiveLengthHeight.Value,
                    request.WeightKg.Value,
                    request.IsMeasuredRecumbent || request.BodyLengthCm.HasValue);

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

        var vitals = queueItem.TriageVitals;
        if (vitals == null)
        {
            vitals = new TriageVitals
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                QueueItemId = queueItem.Id,
                PatientId = queueItem.PatientId,
                NurseId = request.NurseId,
                RecordedByNurseName = request.RecordedByNurseName?.Trim(),
                RecordedAt = DateTime.UtcNow,
                SystolicBp = request.SystolicBp,
                DiastolicBp = request.DiastolicBp,
                HeartRateBpm = request.HeartRateBpm,
                TemperatureCelsius = request.TemperatureCelsius,
                RespiratoryRateBreathsPerMin = request.RespiratoryRateBreathsPerMin,
                OxygenSaturationPercent = request.OxygenSaturationPercent,
                HeightCm = request.HeightCm,
                WeightKg = request.WeightKg,
                Bmi = calculatedBmi,
                PainScore = request.PainScore,
                Notes = request.Notes?.Trim(),
                VisualAcuityLeft = request.VisualAcuityLeft?.Trim(),
                VisualAcuityRight = request.VisualAcuityRight?.Trim(),
                HeadCircumferenceCm = request.HeadCircumferenceCm,
                MidUpperArmCircumferenceCm = request.MidUpperArmCircumferenceCm,
                IsMeasuredRecumbent = request.IsMeasuredRecumbent,
                WaistCircumferenceCm = request.WaistCircumferenceCm,
                HipCircumferenceCm = request.HipCircumferenceCm,
                BodyLengthCm = request.BodyLengthCm,
                SkinfoldThicknessMm = request.SkinfoldThicknessMm,
                LimbsCircumferenceCm = request.LimbsCircumferenceCm,
                ZScoreWeightForAge = zWeightForAge,
                ZScoreLengthForAge = zLengthForAge,
                ZScoreWeightForLength = zWeightForLength,
                GrowthZScoreCategory = zCategory,
                GrowthZScoreCode = zCode,
                PreAssessmentNotes = request.PreAssessmentNotes?.Trim(),
                PreAssessmentRemarks = request.PreAssessmentRemarks?.Trim(),
                TriageAcuityReason = request.TriageAcuityReason?.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = _clinicContext.StaffId?.ToString() ?? "Nurse"
            };

            await _vitalsRepository.AddAsync(vitals, cancellationToken);
        }
        else
        {
            vitals.NurseId = request.NurseId ?? vitals.NurseId;
            vitals.RecordedByNurseName = request.RecordedByNurseName?.Trim() ?? vitals.RecordedByNurseName;
            vitals.RecordedAt = DateTime.UtcNow;
            vitals.SystolicBp = request.SystolicBp;
            vitals.DiastolicBp = request.DiastolicBp;
            vitals.HeartRateBpm = request.HeartRateBpm;
            vitals.TemperatureCelsius = request.TemperatureCelsius;
            vitals.RespiratoryRateBreathsPerMin = request.RespiratoryRateBreathsPerMin;
            vitals.OxygenSaturationPercent = request.OxygenSaturationPercent;
            vitals.HeightCm = request.HeightCm;
            vitals.WeightKg = request.WeightKg;
            vitals.Bmi = calculatedBmi;
            vitals.PainScore = request.PainScore;
            vitals.Notes = request.Notes?.Trim();
            vitals.VisualAcuityLeft = request.VisualAcuityLeft?.Trim() ?? vitals.VisualAcuityLeft;
            vitals.VisualAcuityRight = request.VisualAcuityRight?.Trim() ?? vitals.VisualAcuityRight;
            vitals.HeadCircumferenceCm = request.HeadCircumferenceCm ?? vitals.HeadCircumferenceCm;
            vitals.MidUpperArmCircumferenceCm = request.MidUpperArmCircumferenceCm ?? vitals.MidUpperArmCircumferenceCm;
            vitals.IsMeasuredRecumbent = request.IsMeasuredRecumbent;
            vitals.WaistCircumferenceCm = request.WaistCircumferenceCm ?? vitals.WaistCircumferenceCm;
            vitals.HipCircumferenceCm = request.HipCircumferenceCm ?? vitals.HipCircumferenceCm;
            vitals.BodyLengthCm = request.BodyLengthCm ?? vitals.BodyLengthCm;
            vitals.SkinfoldThicknessMm = request.SkinfoldThicknessMm ?? vitals.SkinfoldThicknessMm;
            vitals.LimbsCircumferenceCm = request.LimbsCircumferenceCm ?? vitals.LimbsCircumferenceCm;
            vitals.ZScoreWeightForAge = zWeightForAge ?? vitals.ZScoreWeightForAge;
            vitals.ZScoreLengthForAge = zLengthForAge ?? vitals.ZScoreLengthForAge;
            vitals.ZScoreWeightForLength = zWeightForLength ?? vitals.ZScoreWeightForLength;
            vitals.GrowthZScoreCategory = zCategory ?? vitals.GrowthZScoreCategory;
            vitals.GrowthZScoreCode = zCode ?? vitals.GrowthZScoreCode;
            vitals.PreAssessmentNotes = request.PreAssessmentNotes?.Trim() ?? vitals.PreAssessmentNotes;
            vitals.PreAssessmentRemarks = request.PreAssessmentRemarks?.Trim() ?? vitals.PreAssessmentRemarks;
            vitals.TriageAcuityReason = request.TriageAcuityReason?.Trim() ?? vitals.TriageAcuityReason;
            vitals.UpdatedAt = DateTime.UtcNow;
            vitals.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Nurse";

            _vitalsRepository.Update(vitals);
        }

        bool queueItemModified = false;

        // Persist priority change to PostgreSQL if provided
        if (request.Priority.HasValue && queueItem.Priority != request.Priority.Value)
        {
            queueItem.Priority = request.Priority.Value;
            queueItemModified = true;
        }

        // Transition queue status to Triaged if waiting
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
}
