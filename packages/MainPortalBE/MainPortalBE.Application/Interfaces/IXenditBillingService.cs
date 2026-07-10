using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Interfaces;

public interface IXenditBillingService
{
    Task<string> CreateCheckoutSessionAsync(string tenantId, string planId, CancellationToken cancellationToken = default);
    Task<string> GetCustomerPortalUrlAsync(string tenantId, CancellationToken cancellationToken = default);
}
