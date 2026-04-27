using CLINICEZ.PhilHealth.Proxy.Models;
using MediatR;

namespace CLINICEZ.PhilHealth.Proxy.Features.Eligibility.Queries.CheckEligibility;

/// <summary>
/// Checks PhilHealth Konsulta eligibility for a member at a given facility on a consultation date.
/// </summary>
public sealed record CheckEligibilityQuery(
    string PhilHealthNumber,
    string FacilityAccreditationNumber,
    string ConsultationDate,
    IReadOnlyList<string> DiagnosisCodes
) : IRequest<EligibilityResult>;
