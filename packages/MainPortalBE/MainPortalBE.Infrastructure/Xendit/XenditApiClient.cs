using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Infrastructure.Xendit.Models.Customers;
using MainPortalBE.Infrastructure.Xendit.Models.Invoices;
using MainPortalBE.Infrastructure.Xendit.Models.Subscriptions;

namespace MainPortalBE.Infrastructure.Xendit;

public class XenditApiClient : IXenditApiClient
{
    private readonly HttpClient _httpClient;

    public XenditApiClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<XenditInvoiceResponse> CreateInvoiceAsync(XenditInvoiceRequest request, CancellationToken ct = default)
    {
        var response = await _httpClient.PostAsJsonAsync("/v2/invoices", request, ct);
        return await HandleResponseAsync<XenditInvoiceResponse>(response, ct);
    }

    public async Task<XenditInvoiceResponse> GetInvoiceAsync(string invoiceId, CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync($"/v2/invoices/{invoiceId}", ct);
        return await HandleResponseAsync<XenditInvoiceResponse>(response, ct);
    }

    public async Task<XenditCustomerResponse> CreateCustomerAsync(XenditCustomerRequest request, CancellationToken ct = default)
    {
        var response = await _httpClient.PostAsJsonAsync("/customers", request, ct);
        return await HandleResponseAsync<XenditCustomerResponse>(response, ct);
    }

    public async Task<XenditCustomerResponse> GetCustomerAsync(string customerId, CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync($"/customers/{customerId}", ct);
        return await HandleResponseAsync<XenditCustomerResponse>(response, ct);
    }

    public async Task<XenditPlanResponse> CreatePlanAsync(XenditPlanRequest request, CancellationToken ct = default)
    {
        var response = await _httpClient.PostAsJsonAsync("/recurring/plans", request, ct);
        return await HandleResponseAsync<XenditPlanResponse>(response, ct);
    }

    public async Task<XenditSubscriptionResponse> CreateSubscriptionAsync(XenditSubscriptionRequest request, CancellationToken ct = default)
    {
        var response = await _httpClient.PostAsJsonAsync("/recurring/subscriptions", request, ct);
        return await HandleResponseAsync<XenditSubscriptionResponse>(response, ct);
    }

    private async Task<T> HandleResponseAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        if (!response.IsSuccessStatusCode)
        {
            var errorContent = await response.Content.ReadAsStringAsync(ct);
            throw new Exception($"Xendit API Error ({response.StatusCode}): {errorContent}");
        }

        return await response.Content.ReadFromJsonAsync<T>(cancellationToken: ct) 
            ?? throw new Exception("Failed to deserialize Xendit API response.");
    }
}
