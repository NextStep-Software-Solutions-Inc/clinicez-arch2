using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Shared.Security.ClaimTokens;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;

public interface IPatientClaimConflictResolver
{
    ClaimConflictResult Resolve(
        Domain.Entities.Patient? claimant,
        ClaimTokenClaims claims,
        bool isDependentClaim,
        string? relationshipToDependent = null);
}
