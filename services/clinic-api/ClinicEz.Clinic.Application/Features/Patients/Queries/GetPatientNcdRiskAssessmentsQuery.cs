using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetPatientNcdRiskAssessmentsQuery(Guid PatientId, bool IncludeVoided = false) : IRequest<List<NcdRiskAssessmentDto>>;

public sealed class GetPatientNcdRiskAssessmentsQueryHandler : IRequestHandler<GetPatientNcdRiskAssessmentsQuery, List<NcdRiskAssessmentDto>>
{
    private readonly IRepository<NcdRiskAssessment> _ncdRepo;

    public GetPatientNcdRiskAssessmentsQueryHandler(IRepository<NcdRiskAssessment> ncdRepo)
    {
        _ncdRepo = ncdRepo;
    }

    public async Task<List<NcdRiskAssessmentDto>> Handle(GetPatientNcdRiskAssessmentsQuery request, CancellationToken cancellationToken)
    {
        var query = request.IncludeVoided
            ? _ncdRepo.Query(n => n.PatientId == request.PatientId, ignoreQueryFilters: true)
            : _ncdRepo.Query(n => n.PatientId == request.PatientId);

        var entries = await query
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
            entity.CreatedAt,
            entity.CreatedBy,
            entity.UpdatedAt,
            entity.UpdatedBy,
            entity.IsDeleted,
            entity.DeletedAt,
            entity.DeletedBy,
            entity.VoidReason)).ToList();
    }
}
