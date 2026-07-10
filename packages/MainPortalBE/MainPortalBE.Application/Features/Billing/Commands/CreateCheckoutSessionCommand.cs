using MediatR;
using MainPortalBE.Application.Interfaces;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Billing.Commands;

public class CreateCheckoutSessionCommand : IRequest<string>
{
    public string TenantId { get; set; } = string.Empty;
    public string PlanId { get; set; } = string.Empty;
}

public class CreateCheckoutSessionCommandHandler(IXenditBillingService billingService)
    : IRequestHandler<CreateCheckoutSessionCommand, string>
{
    public async Task<string> Handle(CreateCheckoutSessionCommand request, CancellationToken cancellationToken)
    {
        return await billingService.CreateCheckoutSessionAsync(request.TenantId, request.PlanId, cancellationToken);
    }
}
