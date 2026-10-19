using MediatR;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public record CancelSubscriptionCommand(string TenantId) : IRequest<bool>;

public class CancelSubscriptionCommandHandler : IRequestHandler<CancelSubscriptionCommand, bool>
{
    private readonly IBillingProvider _billingService;

    public CancelSubscriptionCommandHandler(IBillingProvider billingService)
    {
        _billingService = billingService;
    }

    public async Task<bool> Handle(CancelSubscriptionCommand request, CancellationToken cancellationToken)
    {
        return await _billingService.CancelSubscriptionAsync(request.TenantId, cancellationToken);
    }
}
