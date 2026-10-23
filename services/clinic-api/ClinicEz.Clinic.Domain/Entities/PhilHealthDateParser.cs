using System;
using System.Globalization;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// High-performance, timezone-resilient date parsing and normalization utility
/// for PhilHealth statutory dates (enlisted_at, valid_until, pAssignedDate, pEnlistDate).
/// Guarantees consistent YYYY-MM-DD representation and isolates calendar dates from host server timezone leakage.
/// </summary>
public static class PhilHealthDateParser
{
    /// <summary>
    /// Philippine Standard Time offset (UTC+8:00, no DST per RA 10535).
    /// </summary>
    public static readonly TimeSpan PhilippineTimeOffset = TimeSpan.FromHours(8);

    /// <summary>
    /// Attempts to parse and normalize a raw date string into standard ISO YYYY-MM-DD format.
    /// Handles YYYY-MM-DD, unpadded dates (YYYY-M-D), ISO-8601 timestamps (T, Z, offsets), and SQL space timestamps.
    /// Returns false if input is null, whitespace, or an invalid date.
    /// </summary>
    public static bool TryNormalizeDate(string? input, out string? normalizedDate)
    {
        normalizedDate = null;
        if (string.IsNullOrWhiteSpace(input))
        {
            return false;
        }

        var trimmed = input.Trim();

        // 1. Delimiter isolation: extract calendar date component before 'T', 't', or ' '
        var delimiterIndex = trimmed.IndexOfAny(['T', 't', ' ']);
        var datePart = delimiterIndex > 0 ? trimmed[..delimiterIndex].Trim() : trimmed;

        // 2. Fast-Path: Parse isolated date component using DateOnly with InvariantCulture
        if (DateOnly.TryParse(datePart, CultureInfo.InvariantCulture, out var dOnly))
        {
            normalizedDate = dOnly.ToString("yyyy-MM-dd");
            return true;
        }

        // 3. Compact YYYYMMDD check if un-hyphenated
        if (datePart.Length == 8 &&
            DateOnly.TryParseExact(datePart, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dCompact))
        {
            normalizedDate = dCompact.ToString("yyyy-MM-dd");
            return true;
        }

        // 4. DateTimeOffset parsing: preserves date component without local machine timezone skew
        if (DateTimeOffset.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dto))
        {
            normalizedDate = dto.Date.ToString("yyyy-MM-dd");
            return true;
        }

        // 5. Invariant DateTime parsing fallback
        if (DateTime.TryParse(datePart, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt) ||
            DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out dt))
        {
            normalizedDate = dt.ToString("yyyy-MM-dd");
            return true;
        }

        return false;
    }

    /// <summary>
    /// Parses the input date string and returns a standardized YYYY-MM-DD string,
    /// or the specified default date if normalization fails.
    /// </summary>
    public static string NormalizeOrDefault(string? input, string defaultDate)
    {
        return TryNormalizeDate(input, out var normalizedDate) ? normalizedDate! : defaultDate;
    }

    /// <summary>
    /// Parses the input date string and returns a standardized YYYY-MM-DD string,
    /// or null if normalization fails.
    /// </summary>
    public static string? NormalizeToIsoDate(string? input)
    {
        return TryNormalizeDate(input, out var normalizedDate) ? normalizedDate : null;
    }

    /// <summary>
    /// Parses the input date string and returns a standardized YYYY-MM-DD string,
    /// or the fallback if normalization fails.
    /// </summary>
    public static string NormalizeToIsoDate(string? input, string fallback)
    {
        return NormalizeOrDefault(input, fallback);
    }

    /// <summary>
    /// Attempts to parse a raw date string into a DateOnly instance.
    /// </summary>
    public static bool TryParseDate(string? input, out DateOnly date)
    {
        if (TryNormalizeDate(input, out var normalized) &&
            DateOnly.TryParseExact(normalized, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
        {
            return true;
        }

        date = default;
        return false;
    }

    /// <summary>
    /// Resolves the statutory effective benefit year from an explicit string or assigned date,
    /// falling back to the current UTC year if both are missing or invalid.
    /// </summary>
    public static int ExtractEffectiveYear(string? effectiveYearStr, string? dateStr, int? defaultYear = null)
    {
        if (int.TryParse(effectiveYearStr, out var ey) && ey > 0)
        {
            return ey;
        }

        if (TryParseDate(dateStr, out var date))
        {
            return date.Year;
        }

        return defaultYear ?? DateTime.UtcNow.Year;
    }
}
