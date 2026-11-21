using System.Net.Http.Json;
using System.Text.Json;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;

internal static class HttpClientExtensions
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    internal static Task<TResponse?> ReadAsAsync<TResponse>(this HttpResponseMessage response)
        => response.Content.ReadFromJsonAsync<TResponse>(JsonOptions);

    /// <summary>Adds the <c>X-Tenant-Id</c> header required by the proxy middleware.</summary>
    internal static HttpRequestMessage WithTenantId(this HttpRequestMessage request, Guid tenantId)
    {
        request.Headers.Add("X-Tenant-Id", tenantId.ToString());
        return request;
    }
}

internal sealed record ApiResult<T>(bool Succeeded, string? Message, T? Data);
