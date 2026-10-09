using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace ClinicEz.Portal.Application.Features.Integrations;

/// <summary>What an API key may read and what a webhook may subscribe to. Only things that are actually served / emitted.</summary>
public static class IntegrationCatalog
{
    public const string ScopeWorkspaceRead = "workspace:read";
    public const string ScopeFacilitiesRead = "facilities:read";

    public const string EventWorkspaceProfileUpdated = "workspace.profile.updated";
    public const string EventFacilityCreated = "facility.created";

    /// <summary>Sent only by the "send test event" action. Not subscribable.</summary>
    public const string EventPing = "webhook.ping";

    public const int MaxActiveApiKeys = 10;
    public const int MaxWebhookEndpoints = 5;

    public static readonly IReadOnlyList<string> Scopes = [ScopeWorkspaceRead, ScopeFacilitiesRead];
    public static readonly IReadOnlyList<string> Events = [EventWorkspaceProfileUpdated, EventFacilityCreated];

    public static string Join(IEnumerable<string> values) =>
        string.Join(',', values.Select(v => v.Trim()).Distinct(StringComparer.Ordinal).OrderBy(v => v, StringComparer.Ordinal));

    public static IReadOnlyList<string> Split(string? csv) =>
        string.IsNullOrWhiteSpace(csv)
            ? []
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

/// <summary>Creates and hashes workspace API keys. Keys are 256 random bits, so a plain SHA-256 is sufficient.</summary>
public static class ApiKeyHasher
{
    public const string KeyMarker = "cez_";
    public const int PrefixLength = 12;

    public static (string Key, string Prefix, string Hash) Generate()
    {
        var key = KeyMarker + Base64Url(RandomNumberGenerator.GetBytes(32));
        return (key, key[..PrefixLength], Hash(key));
    }

    public static string Hash(string key) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))).ToLowerInvariant();

    /// <summary>A new webhook signing secret, shown once.</summary>
    public static string GenerateSigningSecret() => "whsec_" + Base64Url(RandomNumberGenerator.GetBytes(32));

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

/// <summary>
/// Signature scheme for webhook deliveries: header <c>X-ClinicEz-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</c> where
/// v1 is HMAC-SHA256 of <c>"{t}.{body}"</c> with the endpoint's signing secret. Receivers should reject old timestamps.
/// </summary>
public static class WebhookSigner
{
    public static string Sign(string secret, long unixSeconds, string body)
    {
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{unixSeconds}.{body}"));
        return $"t={unixSeconds},v1={Convert.ToHexString(mac).ToLowerInvariant()}";
    }
}
