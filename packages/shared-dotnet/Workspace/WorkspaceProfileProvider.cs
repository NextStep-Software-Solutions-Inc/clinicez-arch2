using System;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Shared.Workspace;

/// <summary>
/// The workspace-level identity inherited by every facility (mirrors portal-api's WorkspaceProfileDto).
/// Contains no secrets; the DPO contact and privacy notice are published to data subjects by design (RA 10173).
/// </summary>
public sealed record WorkspaceProfile(
    string TenantSlug,
    long Version,
    string DisplayName,
    string? LogoUrl,
    string? AccentColorHex,
    string TimeZoneId,
    string Locale,
    string DateFormat,
    string CurrencyCode,
    string? DpoName = null,
    string? DpoEmail = null,
    string? PrivacyNoticeUrl = null);

/// <summary>
/// Read access to the workspace profile for a facility service. Implementations must never throw and
/// never block a facility on portal availability: when the portal is unreachable the last-known copy
/// is returned (kept on disk across restarts, so on-prem facilities keep working offline).
/// </summary>
public interface IWorkspaceProfileProvider
{
    /// <summary>The profile for the tenant (slug or id), or null when it has never been fetched and the portal is unreachable / unknown.</summary>
    Task<WorkspaceProfile?> GetAsync(string tenantIdentifier, CancellationToken ct = default);

    /// <summary>
    /// Non-blocking read of the last-known copy (memory, then the persisted file) with no network call.
    /// For synchronous code paths such as PDF rendering that must never wait on the portal.
    /// </summary>
    WorkspaceProfile? TryGetCached(string tenantIdentifier);

    /// <summary>Marks the cached copy stale so the next read revalidates against the portal.</summary>
    void Invalidate(string tenantIdentifier);
}

/// <summary>Resolves the portal-api base URL from configuration the same way every facility service does.</summary>
public static class PortalApiLocator
{
    public static string ResolveBaseUrl(IConfiguration configuration)
    {
        var portalBase = configuration["Services:PortalApiUrl"] ??
                         configuration["PortalSettings:PortalApiUrl"] ??
                         Environment.GetEnvironmentVariable("PORTAL_API_URL") ??
                         Environment.GetEnvironmentVariable("SERVICES_PORTAL_API_URL") ??
                         "http://portal-api:8080";

        portalBase = portalBase.TrimEnd('/');
        if (portalBase.EndsWith("/api/v1", StringComparison.OrdinalIgnoreCase))
            portalBase = portalBase[..^7].TrimEnd('/');
        return portalBase;
    }
}

/// <summary>
/// Pull-based provider: conditional GET (<c>If-None-Match</c>) against portal-api's anonymous
/// <c>/api/v1/tenants/{slug}/workspace-profile</c>, an in-memory cache with a freshness window,
/// stale-while-error semantics and a persisted last-known copy.
/// </summary>
public sealed class HttpWorkspaceProfileProvider : IWorkspaceProfileProvider
{
    private sealed class Entry
    {
        public WorkspaceProfile Profile { get; init; } = null!;
        public string? ETag { get; init; }
        public DateTimeOffset NextCheck { get; set; }
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public const string HttpClientName = "workspace-profile";

    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<HttpWorkspaceProfileProvider> _logger;
    private readonly TimeProvider _time;
    private readonly ConcurrentDictionary<string, Entry> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.OrdinalIgnoreCase);

    public HttpWorkspaceProfileProvider(
        IHttpClientFactory httpFactory,
        IConfiguration configuration,
        ILogger<HttpWorkspaceProfileProvider> logger,
        TimeProvider? time = null)
    {
        _httpFactory = httpFactory;
        _configuration = configuration;
        _logger = logger;
        _time = time ?? TimeProvider.System;
    }

    private TimeSpan FreshFor => TimeSpan.FromSeconds(Math.Max(1, _configuration.GetValue("WorkspaceProfile:CacheSeconds", 300)));
    private TimeSpan RetryAfterFailure => TimeSpan.FromSeconds(30);

    private string CacheDirectory =>
        _configuration["WorkspaceProfile:CachePath"] ?? System.IO.Path.Combine(AppContext.BaseDirectory, "workspace-profile-cache");

    public void Invalidate(string tenantIdentifier)
    {
        if (string.IsNullOrWhiteSpace(tenantIdentifier)) return;
        if (_cache.TryGetValue(tenantIdentifier.Trim(), out var entry)) entry.NextCheck = DateTimeOffset.MinValue;
    }

    public WorkspaceProfile? TryGetCached(string tenantIdentifier)
    {
        if (string.IsNullOrWhiteSpace(tenantIdentifier)) return null;
        var key = tenantIdentifier.Trim();
        if (_cache.TryGetValue(key, out var hot)) return hot.Profile;

        var persisted = LoadPersisted(key);
        if (persisted == null) return null;
        _cache.TryAdd(key, persisted); // NextCheck is in the past, so GetAsync still revalidates
        return persisted.Profile;
    }

    public async Task<WorkspaceProfile?> GetAsync(string tenantIdentifier, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenantIdentifier)) return null;
        var key = tenantIdentifier.Trim();

        if (_cache.TryGetValue(key, out var hot) && hot.NextCheck > _time.GetUtcNow()) return hot.Profile;

        var gate = _locks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            // Another caller may have refreshed while we waited.
            if (_cache.TryGetValue(key, out hot) && hot.NextCheck > _time.GetUtcNow()) return hot.Profile;

            var known = hot ?? LoadPersisted(key);
            return await RefreshAsync(key, known, ct);
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<WorkspaceProfile?> RefreshAsync(string key, Entry? known, CancellationToken ct)
    {
        try
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                $"{PortalApiLocator.ResolveBaseUrl(_configuration)}/api/v1/tenants/{Uri.EscapeDataString(key)}/workspace-profile");
            if (!string.IsNullOrEmpty(known?.ETag)) request.Headers.IfNoneMatch.Add(EntityTagHeaderValue.Parse(known.ETag));

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            using var http = _httpFactory.CreateClient(HttpClientName);
            using var response = await http.SendAsync(request, timeout.Token);

            if (response.StatusCode == HttpStatusCode.NotModified && known != null)
            {
                known.NextCheck = _time.GetUtcNow() + FreshFor;
                _cache[key] = known;
                return known.Profile;
            }

            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                _cache.TryRemove(key, out _);
                return null;
            }

            response.EnsureSuccessStatusCode();
            var profile = await response.Content.ReadFromJsonAsync<WorkspaceProfile>(Json, timeout.Token);
            if (profile == null) return known?.Profile;

            var entry = new Entry
            {
                Profile = profile,
                ETag = response.Headers.ETag?.ToString(),
                NextCheck = _time.GetUtcNow() + FreshFor
            };
            _cache[key] = entry;
            Persist(key, entry);
            return profile;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            // Stale-while-error: keep serving the last-known copy and retry shortly.
            _logger.LogWarning(ex, "[WorkspaceProfile] Could not refresh profile for '{Tenant}'; using last-known copy: {HasCopy}", key, known != null);
            if (known == null) return null;
            known.NextCheck = _time.GetUtcNow() + RetryAfterFailure;
            _cache[key] = known;
            return known.Profile;
        }
    }

    // ---- persisted last-known copy (survives restarts; lets on-prem facilities run while offline) ----

    private sealed record Persisted(string? ETag, WorkspaceProfile Profile);

    private string PathFor(string key)
    {
        var safe = new StringBuilder();
        foreach (var c in key.ToLowerInvariant())
            safe.Append(char.IsAsciiLetterOrDigit(c) || c is '-' or '_' ? c : '_');
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key.ToLowerInvariant())))[..8];
        return System.IO.Path.Combine(CacheDirectory, $"{safe}.{hash}.json");
    }

    private Entry? LoadPersisted(string key)
    {
        try
        {
            var path = PathFor(key);
            if (!System.IO.File.Exists(path)) return null;
            var saved = JsonSerializer.Deserialize<Persisted>(System.IO.File.ReadAllText(path), Json);
            // NextCheck in the past => the first read after a restart revalidates (cheap 304 when unchanged).
            return saved == null ? null : new Entry { Profile = saved.Profile, ETag = saved.ETag, NextCheck = DateTimeOffset.MinValue };
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[WorkspaceProfile] Ignoring unreadable cached profile for '{Tenant}'.", key);
            return null;
        }
    }

    private void Persist(string key, Entry entry)
    {
        try
        {
            System.IO.Directory.CreateDirectory(CacheDirectory);
            var path = PathFor(key);
            var tmp = path + ".tmp";
            System.IO.File.WriteAllText(tmp, JsonSerializer.Serialize(new Persisted(entry.ETag, entry.Profile), Json));
            System.IO.File.Move(tmp, path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[WorkspaceProfile] Could not persist profile cache for '{Tenant}'.", key);
        }
    }
}
