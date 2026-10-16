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
        if (request.HasHistoryAnginaHeartAttack || request.HasHistoryStrokeOrTia)
        {
            riskBand = "BandE"; // Maximum CVD risk for established vascular disease
        }
        else if (request.SevereChestPainOver30Mins || request.TransientNeurologicalDeficits)
        {
            riskBand = "BandD"; // Urgent symptomatic risk
        }
        else if (string.IsNullOrWhiteSpace(riskBand))
        {
            riskBand = "BandA";
        }

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
            DiagnosedDiabetes = string.IsNullOrWhiteSpace(request.DiagnosedDiabetes) ? "N" : request.DiagnosedDiabetes.Trim().ToUpperInvariant(),
            HasPolyphagia = request.HasPolyphagia,
            HasPolydipsia = request.HasPolydipsia,
            HasPolyuria = request.HasPolyuria,
            DiabetesMedicationStatus = request.DiabetesMedicationStatus?.Trim().ToUpperInvariant(),
            HasRaisedBloodGlucose = request.HasRaisedBloodGlucose,
            FastingBloodSugarMgDl = request.FastingBloodSugarMgDl,
            FastingBloodSugarMmolL = request.FastingBloodSugarMmolL,
            FastingBloodSugarDate = request.FastingBloodSugarDate,
            HasChestPain = request.HasChestPain,
            PainInCenterOfChestOrLeftArm = request.PainInCenterOfChestOrLeftArm,
            PainWhenWalkingUphill = request.PainWhenWalkingUphill,
            SlowsDownWhenPainOccurs = request.SlowsDownWhenPainOccurs,
            PainRelievedWithin10Mins = request.PainRelievedWithin10Mins,
            PainRelievedByNitrates = request.PainRelievedByNitrates,
            PainRelievedWithin10MinsOrNitrates = request.PainRelievedWithin10Mins || request.PainRelievedByNitrates,
            SevereChestPainOver30Mins = request.SevereChestPainOver30Mins,
            TransientNeurologicalDeficits = request.TransientNeurologicalDeficits,
            HasRaisedBloodLipids = request.HasRaisedBloodLipids,
            TotalCholesterolMgDl = request.TotalCholesterolMgDl,
            TotalCholesterolDate = request.TotalCholesterolDate,
            HasHistoryAnginaHeartAttack = request.HasHistoryAnginaHeartAttack,
            HasHistoryStrokeOrTia = request.HasHistoryStrokeOrTia,
            UrineKetonesPresent = request.UrineKetonesPresent,
            UrineKetonesValue = request.UrineKetonesValue?.Trim(),
            UrineKetonesDate = request.UrineKetonesDate,
            UrineProteinPresent = request.UrineProteinPresent,
            UrineProteinValue = request.UrineProteinValue?.Trim(),
            UrineProteinDate = request.UrineProteinDate,
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
