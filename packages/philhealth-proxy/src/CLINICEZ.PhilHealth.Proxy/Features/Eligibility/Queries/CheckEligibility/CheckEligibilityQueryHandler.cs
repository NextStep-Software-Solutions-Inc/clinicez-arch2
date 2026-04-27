using CLINICEZ.PhilHealth.Proxy.Models;
using CLINICEZ.PhilHealth.Proxy.Services;
using MediatR;

namespace CLINICEZ.PhilHealth.Proxy.Features.Eligibility.Queries.CheckEligibility;

public sealed class CheckEligibilityQueryHandler(IPhilHealthSoapClient soapClient)
    : IRequestHandler<CheckEligibilityQuery, EligibilityResult>
{
    public async Task<EligibilityResult> Handle(
        CheckEligibilityQuery request,
        CancellationToken cancellationToken)
    {
        var response = await soapClient.CheckEligibilityAsync(
            request.PhilHealthNumber,
            request.FacilityAccreditationNumber,
            request.ConsultationDate,
            request.DiagnosisCodes,
            cancellationToken);

        if (!response.IsSuccess || response.Data is null)
            throw new InvalidOperationException(
                response.ErrorMessage ?? "Failed to check eligibility with PhilHealth.");

        return response.Data;
    }
}
