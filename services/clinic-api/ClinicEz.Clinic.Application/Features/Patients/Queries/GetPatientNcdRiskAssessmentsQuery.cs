using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetPatientNcdRiskAssessmentsQuery(Guid PatientId) : IRequest<List<NcdRiskAssessmentDto>>;

public sealed class GetPatientNcdRiskAssessmentsQueryHandler : IRequestHandler<GetPatientNcdRiskAssessmentsQuery, List<NcdRiskAssessmentDto>>
{
    private readonly IRepository<NcdRiskAssessment> _ncdRepo;
    private readonly ILegacyPatientProfileIngestionService _legacyIngestion;

    public GetPatientNcdRiskAssessmentsQueryHandler(
        IRepository<NcdRiskAssessment> ncdRepo,
        ILegacyPatientProfileIngestionService legacyIngestion)
    {
        _ncdRepo = ncdRepo;
        _legacyIngestion = legacyIngestion;
    }

    public async Task<List<NcdRiskAssessmentDto>> Handle(GetPatientNcdRiskAssessmentsQuery request, CancellationToken cancellationToken)
    {
        await _legacyIngestion.EnsureIngestedAsync(request.PatientId, cancellationToken);

        var entries = await _ncdRepo.Query(n => n.PatientId == request.PatientId)
            .OrderByDescending(n => n.AssessmentDate)
            .ToListAsync(cancellationToken);

        return entries.Select(entity => new NcdRiskAssessmentDto(
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
            entity.CreatedAt)).ToList();
    }
}
