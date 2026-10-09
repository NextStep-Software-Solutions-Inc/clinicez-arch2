using System.Net.Http.Json;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Infrastructure.Hub;

/// <summary>
/// Directory search over HTTP: portal-api authenticates to the hub as a ControlPlane client and states which workspace
/// it is searching for in <c>X-Hub-Tenant</c>. A ControlPlane call without a tenant would see the whole directory,
/// so the tenant is mandatory here.
/// </summary>
public sealed class HubDirectoryHttpClient : IHubDirectoryClient
{
    public const string TenantHeader = "X-Hub-Tenant";

    private readonly HttpClient _http;

    public HubDirectoryHttpClient(HttpClient http, IOptions<InteropOptions> options)
    {
        _http = http;
        var o = options.Value;
        if (_http.BaseAddress is null && !string.IsNullOrWhiteSpace(o.HubUrl))
            _http.BaseAddress = new Uri(o.HubUrl.TrimEnd('/') + "/");
        _http.DefaultRequestHeaders.Remove(HubHttpClient.ClientIdHeader);
        _http.DefaultRequestHeaders.Remove(HubHttpClient.ClientSecretHeader);
        _http.DefaultRequestHeaders.Add(HubHttpClient.ClientIdHeader, o.ClientId);
        _http.DefaultRequestHeaders.Add(HubHttpClient.ClientSecretHeader, o.ClientSecret);
    }

    public async Task<IReadOnlyList<DirectoryFacilityDto>> SearchFacilitiesAsync(
        Guid tenantId,
        DirectorySearchCriteria criteria,
        CancellationToken cancellationToken)
    {
        var query = new List<string>();
        if (criteria.FacilityType is { } type) query.Add($"type={Uri.EscapeDataString(type.ToString())}");
        if (!string.IsNullOrWhiteSpace(criteria.Query)) query.Add($"q={Uri.EscapeDataString(criteria.Query.Trim())}");
        if (!string.IsNullOrWhiteSpace(criteria.City)) query.Add($"city={Uri.EscapeDataString(criteria.City.Trim())}");

        var uri = query.Count == 0 ? "v1/directory/facilities" : $"v1/directory/facilities?{string.Join('&', query)}";
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Add(TenantHeader, tenantId.ToString());

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"Hub directory search failed: {(int)response.StatusCode} {response.ReasonPhrase}.",
                inner: null,
                statusCode: response.StatusCode);
        }

        return await response.Content.ReadFromJsonAsync<List<DirectoryFacilityDto>>(InteropJson.Options, cancellationToken) ?? [];
    }
}
