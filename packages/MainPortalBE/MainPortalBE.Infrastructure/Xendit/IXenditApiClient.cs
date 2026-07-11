using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Infrastructure.Xendit.Models.Customers;
using MainPortalBE.Infrastructure.Xendit.Models.Invoices;
using MainPortalBE.Infrastructure.Xendit.Models.Subscriptions;

namespace MainPortalBE.Infrastructure.Xendit;

public interface IXenditApiClient
{
    // Invoices
    Task<XenditInvoiceResponse> CreateInvoiceAsync(XenditInvoiceRequest request, CancellationToken ct = default);
    Task<XenditInvoiceResponse> GetInvoiceAsync(string invoiceId, CancellationToken ct = default);

    // Customers
    Task<XenditCustomerResponse> CreateCustomerAsync(XenditCustomerRequest request, CancellationToken ct = default);
    Task<XenditCustomerResponse> GetCustomerAsync(string customerId, CancellationToken ct = default);
    Task<System.Collections.Generic.List<XenditCustomerResponse>> SearchCustomersByReferenceAsync(string referenceId, CancellationToken ct = default);

    // Subscriptions & Plans
    Task<XenditPlanResponse> CreatePlanAsync(XenditPlanRequest request, CancellationToken ct = default);
    Task<XenditSubscriptionResponse> CreateSubscriptionAsync(XenditSubscriptionRequest request, CancellationToken ct = default);
    Task DeactivatePlanAsync(string planId, CancellationToken ct = default);
}
