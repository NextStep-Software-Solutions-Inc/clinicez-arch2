using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.LocalAuth;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Forwards GAMOT calls to the pharmacy API with the shared internal key. The pharmacy address is configuration
/// (<c>Services:PharmacyApiUrl</c>); the key is <c>Services:PharmacyApiKey</c> or, when the whole site shares one,
/// <c>Internal:ApiKey</c>. Nothing from the caller's own credentials is forwarded.
/// </summary>
public sealed class PharmacyGamotGateway : IPharmacyGamotGateway
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(45);

    private readonly HttpClient _http;
    private readonly IClinicContext _clinic;
    private readonly ILogger<PharmacyGamotGateway> _logger;
    private readonly string? _baseUrl;
    private readonly string? _key;

    public PharmacyGamotGateway(
        HttpClient http,
        IConfiguration configuration,
        IClinicContext clinic,
        ILogger<PharmacyGamotGateway> logger)
    {
        _http = http;
        _clinic = clinic;
        _logger = logger;
        _baseUrl = NullIfBlank(configuration["Services:PharmacyApiUrl"])?.TrimEnd('/');
        _key = NullIfBlank(configuration["Services:PharmacyApiKey"]) ?? NullIfBlank(configuration["Internal:ApiKey"]);
    }

    public async Task<GamotGatewayResult> SendAsync(
        string method,
        string relativePath,
        string queryString,
        string? jsonBody,
        CancellationToken ct)
    {
        if (_baseUrl is null || _key is null)
        {
            return Unavailable("GAMOT is not configured on this server. Set Services:PharmacyApiUrl and the internal service key.");
        }

        var url = $"{_baseUrl}/api/v1/gamot/{relativePath.TrimStart('/')}{queryString}";
        using var request = new HttpRequestMessage(new HttpMethod(method), url);
        request.Headers.TryAddWithoutValidation(FacilityAuthSchemes.InternalKeyHeader, _key);
        if (!string.IsNullOrWhiteSpace(_clinic.TenantId))
        {
            request.Headers.TryAddWithoutValidation("X-Tenant-Id", _clinic.TenantId);
        }

        if (jsonBody is not null)
        {
            request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(Timeout);
        try
        {
            using var response = await _http.SendAsync(request, timeout.Token);
            var body = await response.Content.ReadAsStringAsync(timeout.Token);
            return new GamotGatewayResult((int)response.StatusCode, response.Content.Headers.ContentType?.ToString(), body);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "GAMOT request to the pharmacy failed ({Method} {Path}).", method, relativePath);
            return Unavailable("The pharmacy could not be reached. Try again in a moment.");
        }
    }

    private static GamotGatewayResult Unavailable(string message)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(new { succeeded = false, message, errors = Array.Empty<string>() });
        return new GamotGatewayResult(503, new MediaTypeHeaderValue("application/json").ToString(), json);
    }

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
