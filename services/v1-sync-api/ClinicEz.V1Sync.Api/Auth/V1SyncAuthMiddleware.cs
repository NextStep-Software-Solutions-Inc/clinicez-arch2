using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.V1Sync.Api.Auth;

/// <summary>
/// Enforces ClinicEZ Platform Admin authorization (`manage:migrations`) on `/api/v1/v1-sync/*`.
/// In Production/Staging, validates the Clerk JWT Bearer and checks `manage:migrations` via
/// `portal-api`'s `/api/v1/admin/me` endpoint (cached 60s per token hash, bounded).
/// </summary>
public sealed class V1SyncAdminGuard
{
    public const string RequiredPermission = "manage:migrations";
    public const int DefaultMaxCacheEntries = 512;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);

    private sealed record CachedDecision(bool Allowed, string Actor, DateTimeOffset ExpiresAtUtc);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private readonly IHostEnvironment _env;
    private readonly ILogger<V1SyncAdminGuard> _logger;
    private readonly TimeProvider _timeProvider;
    private readonly int _maxCacheEntries;
    private readonly object _cacheEvictionLock = new();
    private readonly ConcurrentDictionary<string, CachedDecision> _cache = new();

    [ActivatorUtilitiesConstructor]
    public V1SyncAdminGuard(
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        IHostEnvironment env,
        ILogger<V1SyncAdminGuard> logger)
        : this(httpClientFactory, config, env, logger, null, DefaultMaxCacheEntries)
    {
    }

    public V1SyncAdminGuard(
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        IHostEnvironment env,
        ILogger<V1SyncAdminGuard> logger,
        TimeProvider? timeProvider,
        int maxCacheEntries = DefaultMaxCacheEntries)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
        _env = env;
        _logger = logger;
        _timeProvider = timeProvider ?? TimeProvider.System;
        _maxCacheEntries = Math.Max(1, maxCacheEntries);
    }

    public int CacheCount => _cache.Count;

    private static readonly HashSet<string> MfaAmrMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "mfa",
        "totp",
        "otp",
        "webauthn",
        "backup_code",
        "2fa",
        "sms",
        "hwk",
        "swk"
    };

    /// <summary>
    /// Enforces active Multi-Factor Authentication (MFA) for Tier 2 break-glass unmasked inspection.
    /// Fails closed unless the validated Clerk session principal proves a verified 2nd factor (`fva[1] >= 0`
    /// or an MFA `amr` method), or an explicit dev-only override is enabled in Development.
    /// </summary>
    public (bool Allowed, int StatusCode, string? Error) AuthorizeBreakGlassMfa(HttpContext ctx)
    {
        if (HasVerifiedMfaClaims(ctx.User))
        {
            return (true, StatusCodes.Status200OK, null);
        }

        if (_env.IsDevelopment() &&
            _config.GetValue("V1Sync:AllowBreakGlassWithoutMfaInDev", false))
        {
            return (true, StatusCodes.Status200OK, null);
        }

        return (
            false,
            StatusCodes.Status403Forbidden,
            "Break-glass unmasked view requires active Multi-Factor Authentication (MFA) on your admin session.");
    }

    public static bool HasVerifiedMfaClaims(ClaimsPrincipal? user)
    {
        if (user?.Identity?.IsAuthenticated != true)
        {
            return false;
        }

        // 1. Clerk session JWT v2 `fva` claim: [firstFactorAgeMinutes, secondFactorAgeMinutes] (-1 = not verified)
        var fvaClaims = user.FindAll("fva").Select(c => c.Value).ToList();
        if (fvaClaims.Count >= 2 &&
            int.TryParse(fvaClaims[1], out var secondFactorAge) &&
            secondFactorAge >= 0)
        {
            return true;
        }

        if (fvaClaims.Count == 1)
        {
            var raw = fvaClaims[0].Trim();
            if (raw.StartsWith('[') && raw.EndsWith(']'))
            {
                try
                {
                    using var doc = JsonDocument.Parse(raw);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array &&
                        doc.RootElement.GetArrayLength() >= 2 &&
                        doc.RootElement[1].ValueKind == JsonValueKind.Number &&
                        doc.RootElement[1].TryGetInt32(out var secondAge) &&
                        secondAge >= 0)
                    {
                        return true;
                    }
                }
                catch (JsonException)
                {
                    // Ignore malformed fva claim
                }
            }
        }

        // 2. Standard OIDC `amr` (Authentication Methods References) claim
        foreach (var amrClaim in user.FindAll("amr"))
        {
            var raw = amrClaim.Value.Trim();
            if (raw.StartsWith('[') && raw.EndsWith(']'))
            {
                try
                {
                    using var doc = JsonDocument.Parse(raw);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var el in doc.RootElement.EnumerateArray())
                        {
                            if (el.ValueKind == JsonValueKind.String &&
                                MfaAmrMethods.Contains(el.GetString() ?? string.Empty))
                            {
                                return true;
                            }
                        }
                    }
                }
                catch (JsonException)
                {
                    // Ignore malformed amr JSON
                }
            }
            else if (MfaAmrMethods.Contains(raw))
            {
                return true;
            }
        }

        return false;
    }

    public async Task<(bool Allowed, int StatusCode, string Actor, string? Error)> AuthorizeAsync(
        HttpContext ctx,
        CancellationToken ct)
    {
        // 1. Optional local development loopback or explicit local admin key (Development only)
        if (_env.IsDevelopment())
        {
            var localKey = _config["V1Sync:LocalAdminKey"];
            if (!string.IsNullOrWhiteSpace(localKey) &&
                ctx.Request.Headers.TryGetValue("X-V1-Sync-Admin-Key", out var providedKey) &&
                CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(localKey),
                    Encoding.UTF8.GetBytes(providedKey.ToString())))
            {
                return (true, 200, "local-admin-key", null);
            }

            if (_config.GetValue("V1Sync:AllowUnauthenticatedLocalDev", false) &&
                !HasForwardingHeaders(ctx.Request.Headers) &&
                IsLoopback(ctx.Connection.RemoteIpAddress) &&
                !ctx.Request.Headers.ContainsKey("Authorization"))
            {
                return (true, 200, "local-dev-admin", null);
            }
        }

        // 2. Require authenticated Clerk Bearer JWT
        var authHeader = ctx.Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return (false, StatusCodes.Status401Unauthorized, string.Empty, "Missing Clerk Bearer authorization header.");
        }

        var token = authHeader["Bearer ".Length..].Trim();
        var clerkAuthority = _config["Clerk:Authority"];
        if (!string.IsNullOrWhiteSpace(clerkAuthority) && ctx.User?.Identity?.IsAuthenticated != true)
        {
            return (false, StatusCodes.Status401Unauthorized, string.Empty, "Invalid or expired Clerk JWT.");
        }

        var now = _timeProvider.GetUtcNow();
        var cacheKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
        if (_cache.TryGetValue(cacheKey, out var cached))
        {
            if (cached.ExpiresAtUtc > now)
            {
                return cached.Allowed
                    ? (true, 200, cached.Actor, null)
                    : (false, StatusCodes.Status403Forbidden, cached.Actor, $"Missing required admin permission '{RequiredPermission}'.");
            }

            _cache.TryRemove(cacheKey, out _);
        }

        // 3. Verify live admin RBAC permissions against portal-api `/api/v1/admin/me` (fail-closed in ALL environments)
        var portalBaseUrl = _config["PortalApi:BaseUrl"]?.TrimEnd('/');
        if (string.IsNullOrWhiteSpace(portalBaseUrl))
        {
            return (false, StatusCodes.Status503ServiceUnavailable, string.Empty, "PortalApi:BaseUrl is not configured for RBAC verification.");
        }

        try
        {
            var client = _httpClientFactory.CreateClient("PortalAdminAuth");
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{portalBaseUrl}/api/v1/admin/me");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var resp = await client.SendAsync(req, ct);

            if (resp.StatusCode == HttpStatusCode.Unauthorized)
            {
                return (false, StatusCodes.Status401Unauthorized, string.Empty, "Admin session rejected by portal-api.");
            }

            if (!resp.IsSuccessStatusCode)
            {
                return (false, StatusCodes.Status403Forbidden, string.Empty, "Caller is not an active platform administrator.");
            }

            var json = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var actor = root.TryGetProperty("email", out var emailEl) && emailEl.ValueKind == JsonValueKind.String
                ? emailEl.GetString()!
                : (ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? "platform-admin");

            var isSuperAdmin = root.TryGetProperty("isSuperAdmin", out var saEl) && saEl.ValueKind == JsonValueKind.True;
            var hasPerm = isSuperAdmin;
            if (!hasPerm && root.TryGetProperty("permissions", out var permsEl) && permsEl.ValueKind == JsonValueKind.Array)
            {
                hasPerm = permsEl.EnumerateArray()
                    .Where(e => e.ValueKind == JsonValueKind.String)
                    .Any(e => string.Equals(e.GetString(), RequiredPermission, StringComparison.OrdinalIgnoreCase));
            }

            SetCacheEntry(cacheKey, new CachedDecision(hasPerm, actor, now + CacheTtl), now);

            return hasPerm
                ? (true, 200, actor, null)
                : (false, StatusCodes.Status403Forbidden, actor, $"Admin lacks required permission '{RequiredPermission}'.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to validate admin RBAC against portal-api.");
            return (false, StatusCodes.Status503ServiceUnavailable, string.Empty, "Unable to verify admin RBAC with portal-api.");
        }
    }

    private void SetCacheEntry(string cacheKey, CachedDecision decision, DateTimeOffset now)
    {
        lock (_cacheEvictionLock)
        {
            foreach (var kv in _cache)
            {
                if (kv.Value.ExpiresAtUtc <= now)
                {
                    _cache.TryRemove(kv.Key, out _);
                }
            }

            if (_cache.Count >= _maxCacheEntries && !_cache.ContainsKey(cacheKey))
            {
                var excess = _cache.Count - _maxCacheEntries + 1;
                foreach (var oldest in _cache.OrderBy(kv => kv.Value.ExpiresAtUtc).Take(excess))
                {
                    _cache.TryRemove(oldest.Key, out _);
                }
            }

            _cache[cacheKey] = decision;
        }
    }

    private static bool HasForwardingHeaders(IHeaderDictionary headers) =>
        headers.ContainsKey("X-Forwarded-For") ||
        headers.ContainsKey("Forwarded") ||
        headers.ContainsKey("X-Real-IP");

    private static bool IsLoopback(IPAddress? ip)
    {
        if (ip is null) return false;
        var normalized = ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip;
        return IPAddress.IsLoopback(normalized) || normalized.Equals(IPAddress.IPv6Loopback);
    }
}
