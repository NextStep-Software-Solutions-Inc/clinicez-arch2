using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace ClinicEz.Shared.Common;

/// <summary>
/// Authoritative single source of truth for canonical unauthenticated public URLs across ClinicEZ.
/// Mirrors packages/shared-ts publicRoutes 1:1.
/// </summary>
public static partial class PublicRoutes
{
    private const string SecurityDigestPrefix = "SEC-SHA256-";
    private const int ShortSignatureLength = 12;

    [GeneratedRegex(@"^[A-Z0-9]{3,50}$", RegexOptions.Compiled)]
    private static partial Regex UnprefixedRegex();

    [GeneratedRegex(@"^[A-Z0-9]{4}-[A-Z0-9]{1,45}$", RegexOptions.Compiled)]
    private static partial Regex PrefixedRegex();

    private static string CleanBaseUrl(string? baseUrl) =>
        string.IsNullOrWhiteSpace(baseUrl) ? string.Empty : baseUrl.Trim().TrimEnd('/');

    private static string? NormalizeSig(string? sig)
    {
        if (string.IsNullOrWhiteSpace(sig)) return null;
        var trimmed = sig.Trim();
        if (trimmed.StartsWith(SecurityDigestPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var clean = trimmed[SecurityDigestPrefix.Length..];
            return clean.Length >= ShortSignatureLength ? clean[..ShortSignatureLength] : clean;
        }
        return trimmed;
    }

    /// <summary>
    /// Generates canonical unauthenticated join URL:
    /// - baseUrl = null, code = null -> "/join"
    /// - baseUrl = "https://portal.clinicez.ph", code = null -> "https://portal.clinicez.ph/join"
    /// - baseUrl = null, code = "APEX2026" -> "/join?code=APEX2026"
    /// </summary>
    public static string Join(string? baseUrl = null, string? code = null)
    {
        var baseUri = CleanBaseUrl(baseUrl);
        var trimmedCode = code?.Trim();
        var query = !string.IsNullOrEmpty(trimmedCode) ? $"?code={Uri.EscapeDataString(trimmedCode)}" : string.Empty;
        return $"{baseUri}/join{query}";
    }

    /// <summary>
    /// Generates canonical facility-specific join URL:
    /// - baseUrl = null, code = null -> "/join/{tenantSlug}/{facilitySlug}"
    /// - with code -> "/join/{tenantSlug}/{facilitySlug}?code={code}"
    /// </summary>
    public static string FacilityJoin(string tenantSlug, string facilitySlug, string? baseUrl = null, string? code = null)
    {
        if (string.IsNullOrWhiteSpace(tenantSlug)) throw new ArgumentException("tenantSlug cannot be empty", nameof(tenantSlug));
        if (string.IsNullOrWhiteSpace(facilitySlug)) throw new ArgumentException("facilitySlug cannot be empty", nameof(facilitySlug));

        var baseUri = CleanBaseUrl(baseUrl);
        var trimmedCode = code?.Trim();
        var query = !string.IsNullOrEmpty(trimmedCode) ? $"?code={Uri.EscapeDataString(trimmedCode)}" : string.Empty;
        return $"{baseUri}/join/{Uri.EscapeDataString(tenantSlug.Trim())}/{Uri.EscapeDataString(facilitySlug.Trim())}{query}";
    }

    /// <summary>
    /// Generates canonical unauthenticated account claim URL:
    /// - token = "token-12345" -> "/claim?token=token-12345"
    /// </summary>
    public static string Claim(string token, string? baseUrl = null)
    {
        if (string.IsNullOrWhiteSpace(token)) throw new ArgumentException("token cannot be empty", nameof(token));
        var baseUri = CleanBaseUrl(baseUrl);
        return $"{baseUri}/claim?token={Uri.EscapeDataString(token.Trim())}";
    }

    /// <summary>
    /// Generates canonical document authenticity lookup URL:
    /// - ref = null, sig = null -> "/verify"
    /// - ref = "MC-2026-0001", sig = null -> "/verify?ref=MC-2026-0001"
    /// - ref = "MC-2026-0001", sig = "4FA8B19C30E2" -> "/verify?ref=MC-2026-0001&sig=4FA8B19C30E2"
    /// </summary>
    public static string VerifyLookup(string? baseUrl = null, string? reference = null, string? sig = null)
    {
        var baseUri = CleanBaseUrl(baseUrl);
        var queryParts = new List<string>();
        if (!string.IsNullOrWhiteSpace(reference))
        {
            queryParts.Add($"ref={Uri.EscapeDataString(reference.Trim())}");
        }
        var cleanSig = NormalizeSig(sig);
        if (!string.IsNullOrWhiteSpace(cleanSig))
        {
            queryParts.Add($"sig={Uri.EscapeDataString(cleanSig)}");
        }
        var query = queryParts.Count > 0 ? $"?{string.Join("&", queryParts)}" : string.Empty;
        return $"{baseUri}/verify{query}";
    }

    /// <summary>
    /// Generates canonical typed document authenticity URL:
    /// - kind = "med-cert", token = "MC-2026-0001", sig = "4FA8B19C30E2" -> "/verify/med-cert/MC-2026-0001?sig=4FA8B19C30E2"
    /// - kind = "rx", token = "RX-20261025-0001" -> "/verify/rx/RX-20261025-0001"
    /// </summary>
    public static string VerifyKind(string kind, string token, string? baseUrl = null, string? sig = null)
    {
        if (string.IsNullOrWhiteSpace(kind)) throw new ArgumentException("kind cannot be empty", nameof(kind));
        if (string.IsNullOrWhiteSpace(token)) throw new ArgumentException("token cannot be empty", nameof(token));

        var baseUri = CleanBaseUrl(baseUrl);
        var cleanSig = NormalizeSig(sig);
        var query = !string.IsNullOrWhiteSpace(cleanSig) ? $"?sig={Uri.EscapeDataString(cleanSig)}" : string.Empty;
        return $"{baseUri}/verify/{Uri.EscapeDataString(kind.Trim().ToLowerInvariant())}/{Uri.EscapeDataString(token.Trim())}{query}";
    }

    /// <summary>
    /// Generates canonical prescription verification URL:
    /// Delegates directly to VerifyKind("rx", token, baseUrl, sig: null).
    /// </summary>
    public static string VerifyRx(string token, string? baseUrl = null) =>
        VerifyKind("rx", token, baseUrl);

    /// <summary>
    /// Generates mobile app deep link for clinic join intake:
    /// - code = null -> "clinicez://join"
    /// - code = "B4C7-JOINNOW" -> "clinicez://join?code=B4C7-JOINNOW"
    /// </summary>
    public static string MobileJoinDeepLink(string? code = null)
    {
        var trimmed = code?.Trim();
        return !string.IsNullOrEmpty(trimmed)
            ? $"clinicez://join?code={Uri.EscapeDataString(trimmed)}"
            : "clinicez://join";
    }

    /// <summary>
    /// Validates join code against 3-50 char alphanumeric or 4-char prefix hyphenated format.
    /// </summary>
    public static bool IsValidJoinCode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return false;
        var trimmed = code.Trim().ToUpperInvariant();
        if (trimmed.Length < 3 || trimmed.Length > 50) return false;
        return UnprefixedRegex().IsMatch(trimmed) || PrefixedRegex().IsMatch(trimmed);
    }

    /// <summary>
    /// Normalizes join code by trimming whitespace and converting to uppercase.
    /// </summary>
    public static string NormalizeJoinCode(string? code) =>
        string.IsNullOrWhiteSpace(code) ? string.Empty : code.Trim().ToUpperInvariant();
}
