using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

public interface IXenditBillingService
{
    Task<string> CreateCheckoutSessionAsync(string tenantId, string planId, bool isAnnual, CancellationToken cancellationToken = default);
    Task<string> GetCustomerPortalUrlAsync(string tenantId, CancellationToken cancellationToken = default);
    Task<bool> CancelSubscriptionAsync(string tenantId, CancellationToken cancellationToken = default);
}
