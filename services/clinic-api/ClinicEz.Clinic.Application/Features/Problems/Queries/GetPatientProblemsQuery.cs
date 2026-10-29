using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Problems.Dtos;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Problems.Queries;

public record GetPatientProblemsQuery(Guid PatientId, string? Status = null) : IRequest<IReadOnlyList<PatientProblemDto>>;

public class GetPatientProblemsQueryHandler : IRequestHandler<GetPatientProblemsQuery, IReadOnlyList<PatientProblemDto>>
{
    private readonly IRepository<PatientMedicalHistory> _problemRepo;
    private readonly IClinicContext _clinicContext;

    public GetPatientProblemsQueryHandler(
        IRepository<PatientMedicalHistory> problemRepo,
        IClinicContext clinicContext)
    {
        _problemRepo = problemRepo;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<PatientProblemDto>> Handle(GetPatientProblemsQuery query, CancellationToken cancellationToken)
    {
        var dbQuery = _problemRepo.Query(p => p.PatientId == query.PatientId && p.ClinicId == _clinicContext.ClinicId && p.Category == MedicalHistoryCategory.ProblemListItem)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Status) && Enum.TryParse<ProblemStatus>(query.Status, true, out var parsedStatus))
        {
            dbQuery = dbQuery.Where(p => p.Status == parsedStatus);
        }

        var problems = await dbQuery
            .OrderByDescending(p => p.OnsetDate ?? DateOnly.MinValue)
            .ThenByDescending(p => p.CreatedAt)
            .ToListAsync(cancellationToken);

        return problems.Select(p => new PatientProblemDto(
            p.Id,
            p.ClinicId,
            p.PatientId,
            p.ConsultationEncounterId,
            p.Icd10Code ?? string.Empty,
            p.ConditionTitle,
            p.PhilHealthMdiseaseCode,
            p.Status.ToString(),
            p.Severity?.ToString() ?? "Moderate",
            p.IsChronicNcd,
            p.OnsetDate,
            p.ResolvedDate,
            p.ClinicalNotes,
            p.RecordedByStaffId ?? Guid.Empty,
            p.RecordedByStaffName ?? string.Empty,
            p.CreatedAt
        )).ToList();
    }
}
