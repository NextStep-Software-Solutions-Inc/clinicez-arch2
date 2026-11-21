using System;
using System.Collections.Generic;
using System.Text;
using System.Text.Json.Serialization;

namespace ClinicEz.Shared.Common;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum PlatformVerificationStatus
{
    Unverified,
    PendingReview,
    Verified,
    Rejected,
    Suspended
}

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum PractitionerVerificationLevel
{
    Unverified,
    PendingVerification,
    AwaitingConfirmation,
    Verified,
    Rejected,
    Expired,
    Suspended
}

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum DirectorySourceKind
{
    Unspecified,
    PortalControlPlane,
    ClinicSelfPublish
}

public record ProviderAvailabilityWindowDto(
    DayOfWeek DayOfWeek,
    string StartTime,
    string EndTime,
    int SlotDurationMinutes = 30);

public static class PractitionerIdentity
{
    private static readonly string[] DottedTitlePrefixes =
    [
        "dr.", "dra.", "mr.", "mrs.", "ms.", "prof.", "rn.", "md."
    ];

    private static readonly HashSet<string> IgnoredTitleTokens = new(StringComparer.OrdinalIgnoreCase)
    {
        "dr", "dra", "doctor", "rn", "md", "mr", "mrs", "ms", "miss", "prof", "sir", "maam", "atty", "engr", "rev"
    };

    public static string? NormalizePrc(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var buffer = new StringBuilder(raw.Length);
        foreach (var ch in raw.Trim())
        {
            if (char.IsWhiteSpace(ch) || ch == '-' || ch == '.')
                continue;

            buffer.Append(ch);
        }

        var cleaned = buffer.ToString();
        if (cleaned.StartsWith("PRC", StringComparison.OrdinalIgnoreCase))
            cleaned = cleaned[3..];

        if (cleaned.Length == 0)
            return null;

        var allAsciiDigits = true;
        foreach (var ch in cleaned)
        {
            if (!char.IsAsciiDigit(ch))
            {
                allAsciiDigits = false;
                break;
            }
        }

        if (allAsciiDigits)
            return cleaned.Length <= 7 ? cleaned.PadLeft(7, '0') : cleaned;

        return cleaned.ToUpperInvariant();
    }

    public static bool IsValidPrcFormat(string? raw)
    {
        var normalized = NormalizePrc(raw);
        return normalized is not null && IsValidNormalizedPrc(normalized);
    }

    public static string? NormalizeProfessionKind(string? role)
    {
        if (string.IsNullOrWhiteSpace(role))
            return null;

        var trimmed = role.Trim();
        if (string.Equals(trimmed, "Doctor", StringComparison.OrdinalIgnoreCase))
            return "Doctor";
        if (string.Equals(trimmed, "Nurse", StringComparison.OrdinalIgnoreCase))
            return "Nurse";

        return null;
    }

    public static (string ProfessionKind, string NormalizedPrc) FromProfessionAndPrc(string professionKind, string rawPrc)
    {
        var normalizedProfession = NormalizeProfessionKind(professionKind);
        if (normalizedProfession is null)
            throw new ArgumentException("Profession kind must be Doctor or Nurse.", nameof(professionKind));

        var normalizedPrc = NormalizePrc(rawPrc);
        if (normalizedPrc is null || !IsValidNormalizedPrc(normalizedPrc))
            throw new ArgumentException("PRC license number format is invalid.", nameof(rawPrc));

        return (normalizedProfession, normalizedPrc);
    }

    public static bool IsCompatibleNameMatch(string firstNameA, string lastNameA, string firstNameB, string lastNameB)
    {
        var normalizedLastA = CollapseWhitespace(lastNameA);
        var normalizedLastB = CollapseWhitespace(lastNameB);
        if (normalizedLastA.Length == 0 || normalizedLastB.Length == 0)
            return false;

        if (!string.Equals(normalizedLastA, normalizedLastB, StringComparison.OrdinalIgnoreCase))
            return false;

        var tokensA = ExtractFirstNameTokens(firstNameA);
        var tokensB = ExtractFirstNameTokens(firstNameB);
        if (tokensA.Count == 0 || tokensB.Count == 0)
            return false;

        var overlapCount = Math.Min(tokensA.Count, tokensB.Count);
        for (var i = 0; i < overlapCount; i++)
        {
            var tokenA = tokensA[i];
            var tokenB = tokensB[i];
            if (!tokenA.StartsWith(tokenB, StringComparison.OrdinalIgnoreCase) &&
                !tokenB.StartsWith(tokenA, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        return true;
    }

    private static bool IsValidNormalizedPrc(string normalized)
    {
        if (normalized.Length is < 5 or > 12)
            return false;

        var digitCount = 0;
        foreach (var ch in normalized)
        {
            if (!char.IsAsciiLetterOrDigit(ch))
                return false;

            if (char.IsAsciiDigit(ch))
                digitCount++;
        }

        return digitCount >= 4;
    }

    private static string CollapseWhitespace(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        return string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    private static List<string> ExtractFirstNameTokens(string? firstName)
    {
        var result = new List<string>();
        if (string.IsNullOrWhiteSpace(firstName))
            return result;

        var segments = firstName.Split([' ', '\t', '\r', '\n', ',', '-'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var rawSegment in segments)
        {
            var segment = rawSegment;
            var strippedDots = segment.Replace(".", string.Empty, StringComparison.Ordinal);
            if (strippedDots.Length == 0 || IgnoredTitleTokens.Contains(strippedDots))
                continue;

            foreach (var prefix in DottedTitlePrefixes)
            {
                if (segment.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && segment.Length > prefix.Length)
                {
                    segment = segment[prefix.Length..];
                    break;
                }
            }

            var token = segment.Replace(".", string.Empty, StringComparison.Ordinal).Trim();
            if (token.Length > 0 && !IgnoredTitleTokens.Contains(token))
                result.Add(token);
        }

        return result;
    }
}
