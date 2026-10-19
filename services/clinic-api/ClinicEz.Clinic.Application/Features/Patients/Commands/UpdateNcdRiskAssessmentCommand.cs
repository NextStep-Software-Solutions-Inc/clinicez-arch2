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

public sealed record UpdateNcdRiskAssessmentCommand(
    Guid Id,
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

public sealed class UpdateNcdRiskAssessmentCommandValidator : AbstractValidator<UpdateNcdRiskAssessmentCommand>
{
    public UpdateNcdRiskAssessmentCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.PatientId).NotEmpty();
    }
}

public sealed class UpdateNcdRiskAssessmentCommandHandler : IRequestHandler<UpdateNcdRiskAssessmentCommand, NcdRiskAssessmentDto>
{
    private readonly IRepository<NcdRiskAssessment> _ncdRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdateNcdRiskAssessmentCommandHandler(
        IRepository<NcdRiskAssessment> ncdRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _ncdRepo = ncdRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<NcdRiskAssessmentDto> Handle(UpdateNcdRiskAssessmentCommand request, CancellationToken cancellationToken)
    {
        var entity = await _ncdRepo.Query(n => n.Id == request.Id && n.PatientId == request.PatientId && n.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (entity == null)
        {
            throw new NotFoundException($"NCD risk assessment '{request.Id}' was not found for patient '{request.PatientId}'.");
        }

        var riskBand = request.RiskBand;
        if (request.HasHistoryAnginaHeartAttack == true || request.HasHistoryStrokeOrTia == true)
        {
            riskBand = "BandE";
        }
        else if (request.SevereChestPainOver30Mins == true || request.TransientNeurologicalDeficits == true)
        {
            riskBand = "BandD";
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

        if (request.AssessmentDate.HasValue) entity.AssessmentDate = request.AssessmentDate.Value;
        if (request.ConsultationEncounterId.HasValue) entity.ConsultationEncounterId = request.ConsultationEncounterId;
        if (request.AssessedByStaffId.HasValue) entity.AssessedByStaffId = request.AssessedByStaffId;
        if (!string.IsNullOrWhiteSpace(request.AssessedByStaffName)) entity.AssessedByStaffName = request.AssessedByStaffName.Trim();

        entity.EatsProcessedFoodWeekly = request.EatsProcessedFoodWeekly;
        entity.ThreeServingsVegetablesDaily = request.ThreeServingsVegetablesDaily;
        entity.TwoToThreeServingsFruitDaily = request.TwoToThreeServingsFruitDaily;
        entity.PhysicalActivityAtLeast150MinsWeekly = request.PhysicalActivityAtLeast150MinsWeekly;

        entity.DiagnosedDiabetes = normalizedDiabetes;
        entity.HasPolyphagia = request.HasPolyphagia;
        entity.HasPolydipsia = request.HasPolydipsia;
        entity.HasPolyuria = request.HasPolyuria;
        entity.DiabetesMedicationStatus = diabetesMedStatus;
        entity.HasRaisedBloodGlucose = hasRaisedGlucose;
        entity.FastingBloodSugarMgDl = fbsMg;
        entity.FastingBloodSugarMmolL = fbsMmol;
        entity.FastingBloodSugarDate = fbsDate;

        entity.HasChestPain = hasChestPain;
        entity.PainInCenterOfChestOrLeftArm = painCenterLeft;
        entity.PainWhenWalkingUphill = painWalking;
        entity.SlowsDownWhenPainOccurs = slowsDown;
        entity.PainRelievedWithin10Mins = relieved10Mins;
        entity.PainRelievedByNitrates = relievedNitrates;
        entity.PainRelievedWithin10MinsOrNitrates = relieved10MinsOrNitrates;
        entity.SevereChestPainOver30Mins = request.SevereChestPainOver30Mins;
        entity.TransientNeurologicalDeficits = request.TransientNeurologicalDeficits;

        entity.HasRaisedBloodLipids = hasRaisedLipids;
        entity.TotalCholesterolMgDl = cholMg;
        entity.TotalCholesterolDate = cholDate;
        entity.HasHistoryAnginaHeartAttack = request.HasHistoryAnginaHeartAttack;
        entity.HasHistoryStrokeOrTia = request.HasHistoryStrokeOrTia;

        entity.UrineKetonesPresent = ketonesPresent;
        entity.UrineKetonesValue = ketonesVal;
        entity.UrineKetonesDate = ketonesDate;
        entity.UrineProteinPresent = proteinPresent;
        entity.UrineProteinValue = proteinVal;
        entity.UrineProteinDate = proteinDate;

        entity.RiskBand = riskBand;
        entity.CalculatedRiskScorePercent = request.CalculatedRiskScorePercent;
        entity.Remarks = request.Remarks?.Trim();

        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Clinician";

        _ncdRepo.Update(entity);
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
            entity.CreatedAt,
            entity.CreatedBy,
            entity.UpdatedAt,
            entity.UpdatedBy,
            entity.IsDeleted,
            entity.DeletedAt,
            entity.DeletedBy,
            entity.VoidReason);
    }
}
