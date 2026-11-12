using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dispensing.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Common;
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
    QueuePriority? Priority = null,
    string? HomeInstructions = null,
    string? RosCategory = null,
    string? ChiefComplaint = null,
    List<TriageDispensedItemInput>? DispensedItems = null) : IRequest<TriageVitalsDto>;

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
    private readonly IRepository<PatientVitals> _vitalsRepository;
    private readonly IRepository<Patient> _patientRepository;
    private readonly Application.Common.Interfaces.IWhoZScoreCalculator? _zScoreCalculator;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<ClinicDispensingLog>? _dispensingLogRepository;

    public RecordTriageVitalsCommandHandler(
        IRepository<QueueItem> queueRepository,
        IRepository<PatientVitals> vitalsRepository,
        IRepository<Patient> patientRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        Application.Common.Interfaces.IWhoZScoreCalculator? zScoreCalculator = null,
        IRepository<ClinicDispensingLog>? dispensingLogRepository = null)
    {
        _queueRepository = queueRepository;
        _vitalsRepository = vitalsRepository;
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _zScoreCalculator = zScoreCalculator;
        _dispensingLogRepository = dispensingLogRepository;
    }

    public async Task<TriageVitalsDto> Handle(RecordTriageVitalsCommand request, CancellationToken cancellationToken)
    {
        var queueItem = await _queueRepository.Query(q => q.Id == request.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.PatientVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (queueItem == null)
        {
            throw new NotFoundException($"Queue ticket '{request.QueueItemId}' not found in this clinic.");
        }

        ValidateTriageDispensingEligibility(queueItem, request.DispensedItems);
        var parsedRos = RosCategoryHelper.ParseNullable(request.RosCategory);
        if (!parsedRos.HasValue && request.DispensedItems is { Count: > 0 })
        {
            parsedRos = RosCategoryHelper.InferFromSymptom(request.ChiefComplaint ?? queueItem.ChiefComplaint ?? request.PreAssessmentNotes);
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
                    patient.Sex.ToString(),
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

        var vitals = queueItem.PatientVitals;
        if (vitals == null)
        {
            vitals = new PatientVitals
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
                HomeInstructions = string.IsNullOrWhiteSpace(request.HomeInstructions) ? null : request.HomeInstructions.Trim(),
                RosCategory = parsedRos,
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
            if (request.HomeInstructions != null)
            {
                vitals.HomeInstructions = string.IsNullOrWhiteSpace(request.HomeInstructions) ? null : request.HomeInstructions.Trim();
            }
            if (parsedRos.HasValue)
            {
                vitals.RosCategory = parsedRos.Value;
            }
            vitals.UpdatedAt = DateTime.UtcNow;
            vitals.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Nurse";

            _vitalsRepository.Update(vitals);
        }

        bool queueItemModified = false;

        if (request.ChiefComplaint != null)
        {
            var trimmedComplaint = string.IsNullOrWhiteSpace(request.ChiefComplaint) ? null : request.ChiefComplaint.Trim();
            if (queueItem.ChiefComplaint != trimmedComplaint)
            {
                queueItem.ChiefComplaint = trimmedComplaint;
                queueItemModified = true;
            }
        }

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

        var dispensedDtos = await SyncNurseDispensedItemsAsync(
            _dispensingLogRepository ?? (_unitOfWork as IRepositoryProvider)?.GetRepository<ClinicDispensingLog>(),
            _clinicContext,
            queueItem,
            vitals,
            request.DispensedItems,
            cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDto(vitals, queueItem, dispensedDtos);
    }

    internal static void ValidateTriageDispensingEligibility(
        QueueItem queueItem,
        List<TriageDispensedItemInput>? dispensedItems)
    {
        if (dispensedItems is not { Count: > 0 })
        {
            return;
        }

        if (queueItem.Status is QueueStatus.Cancelled or QueueStatus.NoShow or QueueStatus.Diverted)
        {
            throw new BadRequestException($"Cannot dispense OTC medicine or supplies for a visit with status '{queueItem.Status}'.");
        }

        if (queueItem.VisitType != VisitType.VitalsCheckOnly && queueItem.VisitType != VisitType.Consultation)
        {
            throw new BadRequestException("No medicine or medical supply may be dispensed unless the patient undergoes a Consultation or a Vitals Check.");
        }

        foreach (var item in dispensedItems)
        {
            if (string.IsNullOrWhiteSpace(item.ItemName))
            {
                throw new BadRequestException("Dispensed OTC medicine or supply item name is required.");
            }

            if (item.QuantityDispensed <= 0)
            {
                throw new BadRequestException($"Dispensed quantity for '{item.ItemName.Trim()}' must be greater than zero.");
            }
        }
    }

    internal static async Task<IReadOnlyList<ClinicDispensingLogDto>> SyncNurseDispensedItemsAsync(
        IRepository<ClinicDispensingLog>? dispensingLogRepository,
        IClinicContext clinicContext,
        QueueItem queueItem,
        PatientVitals vitals,
        List<TriageDispensedItemInput>? dispensedItems,
        CancellationToken ct)
    {
        if (dispensingLogRepository == null)
        {
            return Array.Empty<ClinicDispensingLogDto>();
        }

        var existingLogs = await dispensingLogRepository
            .Query(d => d.ClinicId == clinicContext.ClinicId &&
                        d.QueueItemId == queueItem.Id &&
                        d.Source == ClinicDispenseSource.NurseVitalsCheck)
            .OrderBy(d => d.DispensedAt)
            .ToListAsync(ct);

        if (dispensedItems == null)
        {
            return existingLogs.Select(l => ClinicDispensingLogMapper.ToDto(l, queueItem, vitals)).ToList().AsReadOnly();
        }

        var preservedLogs = new List<ClinicDispensingLog>();
        foreach (var existing in existingLogs)
        {
            if (existing.ReviewedAt.HasValue)
            {
                preservedLogs.Add(existing);
            }
            else
            {
                dispensingLogRepository.Remove(existing, hardDelete: true);
            }
        }

        var unmatchedPreserved = new List<ClinicDispensingLog>(preservedLogs);
        var now = DateTime.UtcNow;
        var nurseName = !string.IsNullOrWhiteSpace(vitals.RecordedByNurseName)
            ? vitals.RecordedByNurseName!.Trim()
            : "Clinic Nurse";
        var staffId = vitals.NurseId ?? clinicContext.StaffId;
        var createdLogs = new List<ClinicDispensingLog>();

        foreach (var item in dispensedItems)
        {
            var category = string.Equals(item.ItemCategory?.Trim(), "MedicalSupply", StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(item.ItemCategory?.Trim(), "Medical Supply", StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(item.ItemCategory?.Trim(), "Supply", StringComparison.OrdinalIgnoreCase)
                ? ClinicDispenseItemCategory.MedicalSupply
                : ClinicDispenseItemCategory.Medicine;

            var normalizedItemName = item.ItemName.Trim();
            var normalizedDosage = string.IsNullOrWhiteSpace(item.DosageOrSpec) ? null : item.DosageOrSpec.Trim();

            ClinicDispensingLog? matchedPreserved = null;
            if (item.Id.HasValue && item.Id.Value != Guid.Empty)
            {
                matchedPreserved = unmatchedPreserved.FirstOrDefault(p => p.Id == item.Id.Value);
            }

            matchedPreserved ??= unmatchedPreserved.FirstOrDefault(p =>
                string.Equals(p.ItemName, normalizedItemName, StringComparison.OrdinalIgnoreCase) &&
                p.ItemCategory == category &&
                string.Equals(p.DosageOrSpec ?? string.Empty, normalizedDosage ?? string.Empty, StringComparison.OrdinalIgnoreCase) &&
                p.QuantityDispensed == item.QuantityDispensed);

            if (matchedPreserved != null)
            {
                // Already physician-reviewed & preserved; do not insert a duplicate ledger row on vitals edit!
                unmatchedPreserved.Remove(matchedPreserved);
                continue;
            }

            var itemRos = RosCategoryHelper.ParseNullable(item.RosCategory)
                          ?? vitals.RosCategory
                          ?? RosCategoryHelper.InferFromSymptom(queueItem.ChiefComplaint ?? vitals.PreAssessmentNotes ?? item.ItemName);

            var log = new ClinicDispensingLog
            {
                Id = Guid.NewGuid(),
                TenantId = clinicContext.TenantId,
                ClinicId = clinicContext.ClinicId,
                PatientId = queueItem.PatientId,
                PatientName = queueItem.PatientName,
                QueueItemId = queueItem.Id,
                Source = ClinicDispenseSource.NurseVitalsCheck,
                PatientVitalsId = vitals.Id,
                ItemName = normalizedItemName,
                ItemCategory = category,
                DosageOrSpec = normalizedDosage,
                FormOrUnit = string.IsNullOrWhiteSpace(item.FormOrUnit) ? "Piece" : item.FormOrUnit.Trim(),
                QuantityDispensed = item.QuantityDispensed,
                DirectionsOrInstructions = !string.IsNullOrWhiteSpace(item.DirectionsOrInstructions)
                    ? item.DirectionsOrInstructions.Trim()
                    : vitals.HomeInstructions,
                RosCategory = itemRos,
                IsConsultationValidated = true,
                DispensedByStaffId = staffId,
                DispensedByStaffName = nurseName,
                DispensedByRole = "Nurse",
                DispensedAt = now,
                RequiresDoctorReview = true,
                CreatedAt = now,
                CreatedBy = nurseName
            };

            await dispensingLogRepository.AddAsync(log, ct);
            createdLogs.Add(log);
        }

        return preservedLogs
            .Concat(createdLogs)
            .Select(l => ClinicDispensingLogMapper.ToDto(l, queueItem, vitals))
            .ToList()
            .AsReadOnly();
    }

    internal static TriageVitalsDto MapToDto(
        PatientVitals vitals,
        QueueItem? queueItem,
        IReadOnlyList<ClinicDispensingLogDto>? dispensedItems = null)
    {
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
            vitals.TriageAcuityReason,
            vitals.HomeInstructions,
            vitals.RosCategory?.ToString(),
            vitals.RosCategory.HasValue ? RosCategoryHelper.ToDisplayLabel(vitals.RosCategory.Value) : null,
            queueItem?.ChiefComplaint,
            dispensedItems);
    }
}
