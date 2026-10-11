using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Allergies.Queries;

public record GetPatientAllergiesQuery(Guid PatientId) : IRequest<IReadOnlyList<PatientAllergyDto>>;

public class GetPatientAllergiesQueryHandler : IRequestHandler<GetPatientAllergiesQuery, IReadOnlyList<PatientAllergyDto>>
{
    private readonly IRepository<PatientAllergy> _allergyRepo;
    private readonly IClinicContext _clinicContext;

    public GetPatientAllergiesQueryHandler(
        IRepository<PatientAllergy> allergyRepo,
        IClinicContext clinicContext)
    {
        _allergyRepo = allergyRepo;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<PatientAllergyDto>> Handle(GetPatientAllergiesQuery query, CancellationToken cancellationToken)
    {
        var allergies = await _allergyRepo.Query(a => a.PatientId == query.PatientId && a.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .OrderByDescending(a => a.IsAnaphylactic)
            .ThenBy(a => a.Allergen)
            .ToListAsync(cancellationToken);

        return allergies.Select(a => new PatientAllergyDto(
            a.Id,
            a.ClinicId,
            a.PatientId,
            a.Category.ToString(),
            a.Allergen,
            a.AllergenDrugCode,
            a.Severity.ToString(),
            a.ReactionManifestation,
            a.IsAnaphylactic,
            a.Status.ToString(),
            a.OnsetDate,
            a.Notes,
            a.CreatedAt
        )).ToList();
    }
}
