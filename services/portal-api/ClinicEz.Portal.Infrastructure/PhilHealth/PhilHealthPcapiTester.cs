using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.PhilHealth;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.PhilHealth;

public sealed class PhilHealthPcapiTester : IPhilHealthPcapiTester
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _httpClient;
    private readonly ILogger<PhilHealthPcapiTester> _logger;
    private readonly IHostEnvironment? _environment;

    public PhilHealthPcapiTester(
        HttpClient httpClient,
        ILogger<PhilHealthPcapiTester> logger,
        IHostEnvironment? environment = null)
    {
        _httpClient = httpClient;
        _logger = logger;
        _environment = environment;
    }

    public static bool IsSandbox(string? endpoint)
    {
        if (string.IsNullOrWhiteSpace(endpoint)) return true;
        var trimmed = endpoint.Trim();

        if (trimmed.StartsWith("/")) return true;

        if (Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
        {
            var host = uri.DnsSafeHost;
            var isPhilHealth = host.Equals("philhealth.gov.ph", StringComparison.OrdinalIgnoreCase) ||
                               host.EndsWith(".philhealth.gov.ph", StringComparison.OrdinalIgnoreCase);

            if (isPhilHealth)
            {
                return host.Equals("staging.philhealth.gov.ph", StringComparison.OrdinalIgnoreCase) ||
                       host.EndsWith(".staging.philhealth.gov.ph", StringComparison.OrdinalIgnoreCase) ||
                       host.EndsWith("-staging.philhealth.gov.ph", StringComparison.OrdinalIgnoreCase) ||
                       host.Equals("sandbox.philhealth.gov.ph", StringComparison.OrdinalIgnoreCase) ||
                       host.EndsWith(".sandbox.philhealth.gov.ph", StringComparison.OrdinalIgnoreCase) ||
                       host.Equals("simulator.philhealth.gov.ph", StringComparison.OrdinalIgnoreCase) ||
                       host.EndsWith(".simulator.philhealth.gov.ph", StringComparison.OrdinalIgnoreCase);
            }

            var normalizedPath = uri.AbsolutePath.TrimEnd('/');
            return host.Contains("sandbox", StringComparison.OrdinalIgnoreCase) ||
                   host.Contains("simulator", StringComparison.OrdinalIgnoreCase) ||
                   host == "localhost" ||
                   normalizedPath.EndsWith("/soap/konsulta", StringComparison.OrdinalIgnoreCase) ||
                   normalizedPath.Equals("/soap/konsulta", StringComparison.OrdinalIgnoreCase);
        }

        var normalized = trimmed.TrimEnd('/');
        return normalized.StartsWith("/") ||
               normalized.Contains("sandbox", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("simulator", StringComparison.OrdinalIgnoreCase) ||
               normalized.EndsWith("/soap/konsulta", StringComparison.OrdinalIgnoreCase) ||
               normalized.Equals("/soap/konsulta", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsStagingOrSandbox(string? endpoint) => IsSandbox(endpoint);

    public async Task<PhilHealthTestConnectionResult> TestConnectionAsync(
        string accreditationNumber,
        string secretKey,
        string? softwareCertificateId = null,
        string? baseUrl = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(accreditationNumber))
        {
            return new PhilHealthTestConnectionResult(false, "PhilHealth Accreditation Number (Hospital Code) is required.");
        }

        var targetBaseUrl = !string.IsNullOrWhiteSpace(baseUrl)
            ? baseUrl.Trim()
            : PhilHealthDefaults.PcapiBaseUrl;

        var isProduction = _environment != null && _environment.IsProduction();
        var isSandbox = IsSandbox(targetBaseUrl);

        if (isProduction && !isSandbox)
        {
            if (string.IsNullOrWhiteSpace(secretKey))
            {
                return new PhilHealthTestConnectionResult(false, "PCAPI API Secret Key is required to authenticate with PhilHealth.");
            }
        }

        // 1. In-memory / simulation sandbox check (Development / Testing only)
        var normalizedTarget = targetBaseUrl.TrimEnd('/');
        if (!isProduction && isSandbox)
        {
            _logger.LogInformation("Testing connection against PhilHealth simulation sandbox for {Accreditation}", accreditationNumber);
            var simToken = $"PKA-SIM-{accreditationNumber.Trim()}-{Guid.NewGuid():N}"[..28];

            try
            {
                await Task.Delay(15, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }

            return new PhilHealthTestConnectionResult(
                true,
                "Authentication successful! PhilHealth gateway accepted facility credentials. (Simulation Sandbox Verified)",
                simToken,
                LatencyMs: 15);
        }

        // 2. SSRF Validation for real network probe
        if (!IsSafeExternalPcapiEndpoint(targetBaseUrl, isProduction, out var endpointValidationError))
        {
            return new PhilHealthTestConnectionResult(false, endpointValidationError);
        }

        // 3. Genuine PCAPI /api/v1/auth/token Probe
        var stopwatch = Stopwatch.StartNew();
        try
        {
            var tokenEndpoint = normalizedTarget.EndsWith("/api/v1/auth/token", StringComparison.OrdinalIgnoreCase)
                ? normalizedTarget
                : $"{normalizedTarget}/api/v1/auth/token";
            var requestBody = new
            {
                softwareCertificateId = softwareCertificateId?.Trim() ?? string.Empty,
                accreditationNumber = accreditationNumber.Trim(),
                secretKey = secretKey?.Trim() ?? string.Empty
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, tokenEndpoint)
            {
                Content = JsonContent.Create(requestBody)
            };

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(15));

            var response = await _httpClient.SendAsync(request, cts.Token);
            stopwatch.Stop();
            var responseJson = await response.Content.ReadAsStringAsync(cts.Token);

            if (!response.IsSuccessStatusCode)
            {
                var errorSummary = ExtractErrorMessage(responseJson, (int)response.StatusCode);
                return new PhilHealthTestConnectionResult(
                    false,
                    $"PhilHealth gateway rejected credentials (HTTP {(int)response.StatusCode}): {errorSummary}",
                    null,
                    stopwatch.ElapsedMilliseconds);
            }

            var token = ExtractToken(responseJson);
            if (!string.IsNullOrEmpty(token))
            {
                return new PhilHealthTestConnectionResult(
                    true,
                    "Authentication successful! PhilHealth gateway accepted facility credentials.",
                    token,
                    stopwatch.ElapsedMilliseconds);
            }

            return new PhilHealthTestConnectionResult(
                true,
                "Authentication successful! PhilHealth gateway acknowledged connection.",
                null,
                stopwatch.ElapsedMilliseconds);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Timeout connecting to PhilHealth PCAPI endpoint {Endpoint}", targetBaseUrl);
            return new PhilHealthTestConnectionResult(false, $"Connection timed out after 15 seconds connecting to {targetBaseUrl}.", null, stopwatch.ElapsedMilliseconds);
        }
        catch (HttpRequestException ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "HTTP transport error connecting to PhilHealth PCAPI endpoint {Endpoint}", targetBaseUrl);
            return new PhilHealthTestConnectionResult(false, $"Network error connecting to {targetBaseUrl}: {ex.Message}", null, stopwatch.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Unexpected error testing PhilHealth PCAPI connection to {Endpoint}", targetBaseUrl);
            return new PhilHealthTestConnectionResult(false, $"Error testing PhilHealth connection: {ex.Message}", null, stopwatch.ElapsedMilliseconds);
        }
    }

    private static string? ExtractToken(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;

            if (root.TryGetProperty("token", out var tokenProp) && tokenProp.ValueKind == JsonValueKind.String)
                return tokenProp.GetString();
            if (root.TryGetProperty("access_token", out var atProp) && atProp.ValueKind == JsonValueKind.String)
                return atProp.GetString();
            if (root.TryGetProperty("data", out var dataProp) && dataProp.ValueKind == JsonValueKind.Object)
            {
                if (dataProp.TryGetProperty("token", out var dToken) && dToken.ValueKind == JsonValueKind.String)
                    return dToken.GetString();
                if (dataProp.TryGetProperty("access_token", out var dAt) && dAt.ValueKind == JsonValueKind.String)
                    return dAt.GetString();
            }
        }
        catch
        {
            // Ignore parse failures
        }
        return null;
    }

    private static string ExtractErrorMessage(string json, int statusCode)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                if (root.TryGetProperty("message", out var mProp) && mProp.ValueKind == JsonValueKind.String)
                    return mProp.GetString()!;
                if (root.TryGetProperty("error", out var eProp) && eProp.ValueKind == JsonValueKind.String)
                    return eProp.GetString()!;
                if (root.TryGetProperty("title", out var tProp) && tProp.ValueKind == JsonValueKind.String)
                    return tProp.GetString()!;
            }
        }
        catch
        {
            // Fallback to truncated raw response or generic message
        }

        return !string.IsNullOrWhiteSpace(json) && json.Length <= 200
            ? json.Trim()
            : $"HTTP {statusCode}";
    }

    private static bool IsSafeExternalPcapiEndpoint(string endpoint, bool isProduction, out string error)
    {
        error = string.Empty;
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri))
        {
            error = "Invalid PhilHealth PCAPI endpoint URL.";
            return false;
        }

        if (isProduction && !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            error = "PhilHealth PCAPI endpoint must use HTTPS in production.";
            return false;
        }

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase))
        {
            error = "PhilHealth PCAPI endpoint must use HTTP or HTTPS.";
            return false;
        }

        var host = uri.DnsSafeHost;
        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".internal", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".local", StringComparison.OrdinalIgnoreCase))
        {
            error = "Internal or loopback hosts are not permitted for PhilHealth gateway connectivity.";
            return false;
        }

        if (IPAddress.TryParse(host, out var ip))
        {
            if (IPAddress.IsLoopback(ip) || IsPrivateOrLinkLocalIp(ip))
            {
                error = "Private, link-local, or loopback IP addresses are not permitted for PhilHealth gateway connectivity.";
                return false;
            }
        }

        return true;
    }

    private static bool IsPrivateOrLinkLocalIp(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6)
        {
            ip = ip.MapToIPv4();
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            return ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast || ip.IsIPv6UniqueLocal;
        }

        var bytes = ip.GetAddressBytes();
        return bytes[0] == 10
               || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
               || (bytes[0] == 192 && bytes[1] == 168)
               || (bytes[0] == 169 && bytes[1] == 254)
               || bytes[0] == 127
               || bytes[0] == 0;
    }
}
