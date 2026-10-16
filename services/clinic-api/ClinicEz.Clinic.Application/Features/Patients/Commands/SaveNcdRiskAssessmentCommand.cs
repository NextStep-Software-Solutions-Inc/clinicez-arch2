using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record SaveNcdRiskAssessmentCommand(
    Guid PatientId,
    Guid? ConsultationEncounterId = null,
    Guid? AssessedByStaffId = null,
    string? AssessedByStaffName = null,
    bool? EatsProcessedFoodWeekly = null,
    bool? ThreeServingsVegetablesDaily = null,
    bool? TwoToThreeServingsFruitDaily = null,
    bool? PhysicalActivityAtLeast150MinsWeekly = null,
    string? DiagnosedDiabetes = null,
    bool? HasPolyphagia = null,
    bool? HasPolydipsia = null,
    bool? HasPolyuria = null,
    string? DiabetesMedicationStatus = null,
    bool? HasRaisedBloodGlucose = null,
    decimal? FastingBloodSugarMgDl = null,
    decimal? FastingBloodSugarMmolL = null,
    DateOnly? FastingBloodSugarDate = null,
    bool? HasChestPain = null,
    bool? PainInCenterOfChestOrLeftArm = null,
    bool? PainWhenWalkingUphill = null,
    bool? SlowsDownWhenPainOccurs = null,
    bool? PainRelievedWithin10Mins = null,
    bool? PainRelievedByNitrates = null,
    bool? SevereChestPainOver30Mins = null,
    bool? TransientNeurologicalDeficits = null,
    bool? HasRaisedBloodLipids = null,
    decimal? TotalCholesterolMgDl = null,
    DateOnly? TotalCholesterolDate = null,
    bool? HasHistoryAnginaHeartAttack = null,
    bool? HasHistoryStrokeOrTia = null,
    bool? UrineKetonesPresent = null,
    string? UrineKetonesValue = null,
    DateOnly? UrineKetonesDate = null,
    bool? UrineProteinPresent = null,
    string? UrineProteinValue = null,
    DateOnly? UrineProteinDate = null,
    string RiskBand = "BandA",
    decimal? CalculatedRiskScorePercent = null,
    string? Remarks = null,
    DateTime? AssessmentDate = null) : IRequest<NcdRiskAssessmentDto>;

public sealed class SaveNcdRiskAssessmentCommandValidator : AbstractValidator<SaveNcdRiskAssessmentCommand>
{
    public SaveNcdRiskAssessmentCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
    }
}

public sealed class SaveNcdRiskAssessmentCommandHandler : IRequestHandler<SaveNcdRiskAssessmentCommand, NcdRiskAssessmentDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<NcdRiskAssessment> _ncdRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public SaveNcdRiskAssessmentCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<NcdRiskAssessment> ncdRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _ncdRepo = ncdRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<NcdRiskAssessmentDto> Handle(SaveNcdRiskAssessmentCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found in this clinic.");
        }

        // Determine effective RiskBand (incorporating PhilPEN crisis overrides)
        var riskBand = request.RiskBand;
        if (request.HasHistoryAnginaHeartAttack == true || request.HasHistoryStrokeOrTia == true)
        {
            riskBand = "BandE"; // Maximum CVD risk for established vascular disease
        }
        else if (request.SevereChestPainOver30Mins == true || request.TransientNeurologicalDeficits == true)
        {
            riskBand = "BandD"; // Urgent symptomatic risk
        }
        else if (string.IsNullOrWhiteSpace(riskBand))
        {
            riskBand = "BandA";
        }

        // Skip logic sanitization for follow-up questions
        var normalizedDiabetes = string.IsNullOrWhiteSpace(request.DiagnosedDiabetes) ? null : request.DiagnosedDiabetes.Trim().ToUpperInvariant();
        var diabetesMedStatus = normalizedDiabetes == "Y" ? request.DiabetesMedicationStatus?.Trim().ToUpperInvariant() : null;

        var hasChestPain = request.HasChestPain;
        bool? painCenterLeft = null;
        bool? painWalking = null;
        bool? slowsDown = null;
        bool? relieved10Mins = null;
        bool? relievedNitrates = null;
        bool? relieved10MinsOrNitrates = null;

        if (hasChestPain == null && (request.PainInCenterOfChestOrLeftArm.HasValue || request.PainWhenWalkingUphill.HasValue))
        {
            hasChestPain = true;
        }

        if (hasChestPain == true)
        {
            painCenterLeft = request.PainInCenterOfChestOrLeftArm;
            painWalking = request.PainWhenWalkingUphill;
            if (painWalking == true)
            {
                slowsDown = request.SlowsDownWhenPainOccurs;
                relieved10Mins = request.PainRelievedWithin10Mins;
                relievedNitrates = request.PainRelievedByNitrates;
                relieved10MinsOrNitrates = (relieved10Mins == true) || (relievedNitrates == true);
            }
        }

        var hasRaisedGlucose = request.HasRaisedBloodGlucose;
        if (hasRaisedGlucose == null && (request.FastingBloodSugarMgDl.HasValue || request.FastingBloodSugarMmolL.HasValue || request.FastingBloodSugarDate.HasValue))
        {
            hasRaisedGlucose = true;
        }
        var fbsMg = hasRaisedGlucose == false ? null : request.FastingBloodSugarMgDl;
        var fbsMmol = hasRaisedGlucose == false ? null : request.FastingBloodSugarMmolL;
        var fbsDate = hasRaisedGlucose == false ? null : request.FastingBloodSugarDate;

        var hasRaisedLipids = request.HasRaisedBloodLipids;
        if (hasRaisedLipids == null && (request.TotalCholesterolMgDl.HasValue || request.TotalCholesterolDate.HasValue))
        {
            hasRaisedLipids = true;
        }
        var cholMg = hasRaisedLipids == false ? null : request.TotalCholesterolMgDl;
        var cholDate = hasRaisedLipids == false ? null : request.TotalCholesterolDate;

        var ketonesPresent = request.UrineKetonesPresent;
        if (ketonesPresent == null && (!string.IsNullOrWhiteSpace(request.UrineKetonesValue) || request.UrineKetonesDate.HasValue))
        {
            ketonesPresent = true;
        }
        var ketonesVal = ketonesPresent == false ? null : request.UrineKetonesValue?.Trim();
        var ketonesDate = ketonesPresent == false ? null : request.UrineKetonesDate;

        var proteinPresent = request.UrineProteinPresent;
        if (proteinPresent == null && (!string.IsNullOrWhiteSpace(request.UrineProteinValue) || request.UrineProteinDate.HasValue))
        {
            proteinPresent = true;
        }
        var proteinVal = proteinPresent == false ? null : request.UrineProteinValue?.Trim();
        var proteinDate = proteinPresent == false ? null : request.UrineProteinDate;

        var entity = new NcdRiskAssessment
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId ?? _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = request.PatientId,
            ConsultationEncounterId = request.ConsultationEncounterId,
            AssessmentDate = request.AssessmentDate ?? DateTime.UtcNow,
            AssessedByStaffId = request.AssessedByStaffId ?? _clinicContext.StaffId,
            AssessedByStaffName = request.AssessedByStaffName?.Trim() ?? "Clinician",
            EatsProcessedFoodWeekly = request.EatsProcessedFoodWeekly,
            ThreeServingsVegetablesDaily = request.ThreeServingsVegetablesDaily,
            TwoToThreeServingsFruitDaily = request.TwoToThreeServingsFruitDaily,
            PhysicalActivityAtLeast150MinsWeekly = request.PhysicalActivityAtLeast150MinsWeekly,
            DiagnosedDiabetes = normalizedDiabetes,
            HasPolyphagia = request.HasPolyphagia,
            HasPolydipsia = request.HasPolydipsia,
            HasPolyuria = request.HasPolyuria,
            DiabetesMedicationStatus = diabetesMedStatus,
            HasRaisedBloodGlucose = hasRaisedGlucose,
            FastingBloodSugarMgDl = fbsMg,
            FastingBloodSugarMmolL = fbsMmol,
            FastingBloodSugarDate = fbsDate,
            HasChestPain = hasChestPain,
            PainInCenterOfChestOrLeftArm = painCenterLeft,
            PainWhenWalkingUphill = painWalking,
            SlowsDownWhenPainOccurs = slowsDown,
            PainRelievedWithin10Mins = relieved10Mins,
            PainRelievedByNitrates = relievedNitrates,
            PainRelievedWithin10MinsOrNitrates = relieved10MinsOrNitrates,
            SevereChestPainOver30Mins = request.SevereChestPainOver30Mins,
            TransientNeurologicalDeficits = request.TransientNeurologicalDeficits,
            HasRaisedBloodLipids = hasRaisedLipids,
            TotalCholesterolMgDl = cholMg,
            TotalCholesterolDate = cholDate,
            HasHistoryAnginaHeartAttack = request.HasHistoryAnginaHeartAttack,
            HasHistoryStrokeOrTia = request.HasHistoryStrokeOrTia,
            UrineKetonesPresent = ketonesPresent,
            UrineKetonesValue = ketonesVal,
            UrineKetonesDate = ketonesDate,
            UrineProteinPresent = proteinPresent,
            UrineProteinValue = proteinVal,
            UrineProteinDate = proteinDate,
            RiskBand = riskBand,
            CalculatedRiskScorePercent = request.CalculatedRiskScorePercent,
            Remarks = request.Remarks?.Trim(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "Clinician"
        };

        await _ncdRepo.AddAsync(entity, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new NcdRiskAssessmentDto(
            entity.Id,
            entity.PatientId,
            entity.ConsultationEncounterId,
            entity.AssessmentDate,
            entity.AssessedByStaffId,
            entity.AssessedByStaffName,
            entity.EatsProcessedFoodWeekly,
            entity.ThreeServingsVegetablesDaily,
            entity.TwoToThreeServingsFruitDaily,
            entity.PhysicalActivityAtLeast150MinsWeekly,
            entity.DiagnosedDiabetes,
            entity.HasPolyphagia,
            entity.HasPolydipsia,
            entity.HasPolyuria,
            entity.DiabetesMedicationStatus,
            entity.HasRaisedBloodGlucose,
            entity.FastingBloodSugarMgDl,
            entity.FastingBloodSugarMmolL,
            entity.FastingBloodSugarDate,
            entity.HasChestPain,
            entity.PainInCenterOfChestOrLeftArm,
            entity.PainWhenWalkingUphill,
            entity.SlowsDownWhenPainOccurs,
            entity.PainRelievedWithin10Mins,
            entity.PainRelievedByNitrates,
            entity.SevereChestPainOver30Mins,
            entity.TransientNeurologicalDeficits,
            entity.HasRaisedBloodLipids,
            entity.TotalCholesterolMgDl,
            entity.TotalCholesterolDate,
            entity.HasHistoryAnginaHeartAttack,
            entity.HasHistoryStrokeOrTia,
            entity.UrineKetonesPresent,
            entity.UrineKetonesValue,
            entity.UrineKetonesDate,
            entity.UrineProteinPresent,
            entity.UrineProteinValue,
            entity.UrineProteinDate,
            entity.RiskBand,
            entity.CalculatedRiskScorePercent,
            entity.Remarks,
            entity.CreatedAt);
    }
}
