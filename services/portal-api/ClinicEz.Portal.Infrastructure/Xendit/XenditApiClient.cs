using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Infrastructure.Xendit.Models.Customers;
using ClinicEz.Portal.Infrastructure.Xendit.Models.Invoices;
using ClinicEz.Portal.Infrastructure.Xendit.Models.Subscriptions;

namespace ClinicEz.Portal.Infrastructure.Xendit;

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
        var response = await _httpClient.PostAsJsonAsync("/v2/recurring/subscriptions", request, ct);
        return await HandleResponseAsync<XenditSubscriptionResponse>(response, ct);
    }

    public async Task DeactivatePlanAsync(string planId, CancellationToken ct = default)
    {
        var response = await _httpClient.PostAsync($"/recurring/plans/{planId}/deactivate", null, ct);
        if (!response.IsSuccessStatusCode)
        {
            var errorContent = await response.Content.ReadAsStringAsync(ct);
            throw new Exception($"Xendit API Error ({response.StatusCode}): {errorContent}");
        }
    }

    private async Task<T> HandleResponseAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        var rawContent = await response.Content.ReadAsStringAsync(ct);
        Console.WriteLine($"[Xendit Response] {rawContent}");
        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"Xendit API Error ({response.StatusCode}): {rawContent}");
        }

        return JsonSerializer.Deserialize<T>(rawContent) 
            ?? throw new Exception("Failed to deserialize Xendit API response.");
    }

    public async Task<List<XenditCustomerResponse>> SearchCustomersByReferenceAsync(string referenceId, CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync($"/customers?reference_id={referenceId}", ct);
        if (!response.IsSuccessStatusCode)
        {
            return new List<XenditCustomerResponse>();
        }

        try
        {
            var content = await response.Content.ReadAsStringAsync(ct);
            if (content.TrimStart().StartsWith("["))
            {
                return JsonSerializer.Deserialize<List<XenditCustomerResponse>>(content) ?? new List<XenditCustomerResponse>();
            }
            else
            {
                var wrapper = JsonSerializer.Deserialize<XenditCustomerListWrapper>(content);
                return wrapper?.Data ?? new List<XenditCustomerResponse>();
            }
        }
        catch
        {
            return new List<XenditCustomerResponse>();
        }
    }
}

public class XenditCustomerListWrapper
{
    [JsonPropertyName("data")] public List<XenditCustomerResponse> Data { get; set; } = new();
}
