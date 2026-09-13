using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Billing.Queries;

public class GetCustomerPortalUrlQuery : IRequest<string>
{
    public string TenantId { get; set; } = string.Empty;
}

public class GetCustomerPortalUrlQueryHandler(IXenditBillingService billingService)
    : IRequestHandler<GetCustomerPortalUrlQuery, string>
{
    public async Task<string> Handle(GetCustomerPortalUrlQuery request, CancellationToken cancellationToken)
    {
        return await billingService.GetCustomerPortalUrlAsync(request.TenantId, cancellationToken);
    }
}
