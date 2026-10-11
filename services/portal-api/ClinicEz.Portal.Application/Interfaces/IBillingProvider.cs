using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

/// <summary>
/// The payment provider behind workspace billing. The workspace's one <c>Subscription</c> holds the provider's ids; nothing
/// else in the portal knows which provider collects the money.
/// </summary>
public interface IBillingProvider
{
    /// <summary>Starts (or schedules) a plan change through the provider and returns the URL the owner must visit to authorise payment.</summary>
    Task<string> CreateCheckoutSessionAsync(string tenantId, string planId, bool isAnnual, CancellationToken cancellationToken = default);
    Task<string> GetCustomerPortalUrlAsync(string tenantId, CancellationToken cancellationToken = default);
    Task<bool> CancelSubscriptionAsync(string tenantId, CancellationToken cancellationToken = default);
}
