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
    bool EatsProcessedFoodWeekly = false,
    bool ThreeServingsVegetablesDaily = false,
    bool TwoToThreeServingsFruitDaily = false,
    bool PhysicalActivityAtLeast150MinsWeekly = false,
    string DiagnosedDiabetes = "N",
    bool HasPolyphagia = false,
    bool HasPolydipsia = false,
    bool HasPolyuria = false,
    string? DiabetesMedicationStatus = null,
    bool HasRaisedBloodGlucose = false,
    decimal? FastingBloodSugarMgDl = null,
    decimal? FastingBloodSugarMmolL = null,
    DateOnly? FastingBloodSugarDate = null,
    bool HasChestPain = false,
    bool PainInCenterOfChestOrLeftArm = false,
    bool PainWhenWalkingUphill = false,
    bool SlowsDownWhenPainOccurs = false,
    bool PainRelievedWithin10Mins = false,
    bool PainRelievedByNitrates = false,
    bool SevereChestPainOver30Mins = false,
    bool TransientNeurologicalDeficits = false,
    bool HasRaisedBloodLipids = false,
    decimal? TotalCholesterolMgDl = null,
    DateOnly? TotalCholesterolDate = null,
    bool HasHistoryAnginaHeartAttack = false,
    bool HasHistoryStrokeOrTia = false,
    bool UrineKetonesPresent = false,
    string? UrineKetonesValue = null,
    DateOnly? UrineKetonesDate = null,
    bool UrineProteinPresent = false,
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
        if (request.HasHistoryAnginaHeartAttack || request.HasHistoryStrokeOrTia)
        {
            riskBand = "BandE";
        }
        else if (request.SevereChestPainOver30Mins || request.TransientNeurologicalDeficits)
        {
            riskBand = "BandD";
        }
        else if (string.IsNullOrWhiteSpace(riskBand))
        {
            riskBand = "BandA";
        }

        if (request.AssessmentDate.HasValue) entity.AssessmentDate = request.AssessmentDate.Value;
        if (request.ConsultationEncounterId.HasValue) entity.ConsultationEncounterId = request.ConsultationEncounterId;
        if (request.AssessedByStaffId.HasValue) entity.AssessedByStaffId = request.AssessedByStaffId;
        if (!string.IsNullOrWhiteSpace(request.AssessedByStaffName)) entity.AssessedByStaffName = request.AssessedByStaffName.Trim();

        entity.EatsProcessedFoodWeekly = request.EatsProcessedFoodWeekly;
        entity.ThreeServingsVegetablesDaily = request.ThreeServingsVegetablesDaily;
        entity.TwoToThreeServingsFruitDaily = request.TwoToThreeServingsFruitDaily;
        entity.PhysicalActivityAtLeast150MinsWeekly = request.PhysicalActivityAtLeast150MinsWeekly;

        entity.DiagnosedDiabetes = string.IsNullOrWhiteSpace(request.DiagnosedDiabetes) ? "N" : request.DiagnosedDiabetes.Trim().ToUpperInvariant();
        entity.HasPolyphagia = request.HasPolyphagia;
        entity.HasPolydipsia = request.HasPolydipsia;
        entity.HasPolyuria = request.HasPolyuria;
        entity.DiabetesMedicationStatus = request.DiabetesMedicationStatus?.Trim().ToUpperInvariant();
        entity.HasRaisedBloodGlucose = request.HasRaisedBloodGlucose;
        entity.FastingBloodSugarMgDl = request.FastingBloodSugarMgDl;
        entity.FastingBloodSugarMmolL = request.FastingBloodSugarMmolL;
        entity.FastingBloodSugarDate = request.FastingBloodSugarDate;

        entity.HasChestPain = request.HasChestPain;
        entity.PainInCenterOfChestOrLeftArm = request.PainInCenterOfChestOrLeftArm;
        entity.PainWhenWalkingUphill = request.PainWhenWalkingUphill;
        entity.SlowsDownWhenPainOccurs = request.SlowsDownWhenPainOccurs;
        entity.PainRelievedWithin10Mins = request.PainRelievedWithin10Mins;
        entity.PainRelievedByNitrates = request.PainRelievedByNitrates;
        entity.PainRelievedWithin10MinsOrNitrates = request.PainRelievedWithin10Mins || request.PainRelievedByNitrates;
        entity.SevereChestPainOver30Mins = request.SevereChestPainOver30Mins;
        entity.TransientNeurologicalDeficits = request.TransientNeurologicalDeficits;

        entity.HasRaisedBloodLipids = request.HasRaisedBloodLipids;
        entity.TotalCholesterolMgDl = request.TotalCholesterolMgDl;
        entity.TotalCholesterolDate = request.TotalCholesterolDate;
        entity.HasHistoryAnginaHeartAttack = request.HasHistoryAnginaHeartAttack;
        entity.HasHistoryStrokeOrTia = request.HasHistoryStrokeOrTia;

        entity.UrineKetonesPresent = request.UrineKetonesPresent;
        entity.UrineKetonesValue = request.UrineKetonesValue?.Trim();
        entity.UrineKetonesDate = request.UrineKetonesDate;
        entity.UrineProteinPresent = request.UrineProteinPresent;
        entity.UrineProteinValue = request.UrineProteinValue?.Trim();
        entity.UrineProteinDate = request.UrineProteinDate;

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
