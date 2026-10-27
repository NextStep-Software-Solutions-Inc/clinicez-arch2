using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Communications.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Communications.Queries;

public sealed record GetPatientEligibilityGrantsQuery(
    string ClerkUserId) : IRequest<IReadOnlyList<PatientEligibilityGrantDto>>;

public sealed class GetPatientEligibilityGrantsQueryHandler : IRequestHandler<GetPatientEligibilityGrantsQuery, IReadOnlyList<PatientEligibilityGrantDto>>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IPatientCommunicationsRepository _commsRepo;

    public GetPatientEligibilityGrantsQueryHandler(
        IPatientRepository patientRepo,
        IPatientCommunicationsRepository commsRepo)
    {
        _patientRepo = patientRepo;
        _commsRepo = commsRepo;
    }

    public async Task<IReadOnlyList<PatientEligibilityGrantDto>> Handle(
        GetPatientEligibilityGrantsQuery request,
        CancellationToken ct)
    {
        var primaryPatient = await _patientRepo.GetByClerkUserIdWithDetailsAsync(request.ClerkUserId, ct);
        if (primaryPatient == null)
        {
            throw new UnauthorizedException("Patient profile not found for authenticated user.");
        }

        var targetPatientIds = new List<Guid> { primaryPatient.Id };
        if (primaryPatient.ManagedDependents != null)
        {
            targetPatientIds.AddRange(primaryPatient.ManagedDependents.Select(d => d.Id));
        }

        var now = DateTime.UtcNow;
        var grants = await _commsRepo.GetActiveGrantsForPatientsAsync(targetPatientIds, now, ct);

        return grants.Select(g => new PatientEligibilityGrantDto(
            g.GrantId,
            g.PatientId,
            g.TenantId,
            g.FacilityId,
            g.FacilityType,
            g.FacilityName,
            g.ContextType,
            g.ContextId,
            g.IsActive,
            g.WindowStartUtc,
            g.WindowEndUtc
        )).ToList();
    }
}
