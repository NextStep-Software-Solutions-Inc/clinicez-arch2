using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Workspace;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Common.Helpers;

/// <summary>
/// Resolves the active clinic/workspace calendar date (<see cref="DateOnly"/>), timezone, date format, and time format.
/// Priority order:
/// 1. Clinic facility override (<see cref="FacilitySettings.TimeZoneId"/>, <see cref="FacilitySettings.DateFormat"/>, <see cref="FacilitySettings.TimeFormat"/>)
/// 2. Tenant workspace setting (<see cref="WorkspaceProfile.TimeZoneId"/>, <see cref="WorkspaceProfile.DateFormat"/>)
/// 3. System default ("Asia/Manila", "MMM d, yyyy", "12h")
/// </summary>
public static class ClinicTimeZoneResolver
{
    public const string DefaultTimeZoneId = "Asia/Manila";
    public const string DefaultDateFormat = "MMM d, yyyy";
    public const string DefaultTimeFormat = "12h";

    /// <summary>
    /// Resolves today's calendar date in the clinic's effective timezone (clinic override -> workspace profile -> "Asia/Manila")
    /// when <paramref name="workspaceProfiles"/> or <paramref name="settingsRepo"/> is available in DI.
    /// When both are null (e.g. in isolated unit tests that instantiate handlers without DI), falls back to <c>DateTime.UtcNow</c>.
    /// </summary>
    public static async Task<DateOnly> ResolveTodayAsync(
        IWorkspaceProfileProvider? workspaceProfiles,
        string? tenantId,
        CancellationToken ct = default,
        IRepository<FacilitySettings>? settingsRepo = null)
    {
        if (workspaceProfiles is null && settingsRepo is null)
        {
            return DateOnly.FromDateTime(DateTime.UtcNow);
        }

        string? timeZoneId = null;

        if (settingsRepo is not null)
        {
            try
            {
                var clinicTz = await settingsRepo.Query()
                    .Select(s => s.TimeZoneId)
                    .FirstOrDefaultAsync(ct);
                if (!string.IsNullOrWhiteSpace(clinicTz))
                {
                    timeZoneId = clinicTz.Trim();
                }
            }
            catch
            {
                // Ignore if settings query is unavailable in mock repo
            }
        }

        if (string.IsNullOrWhiteSpace(timeZoneId) && workspaceProfiles is not null && !string.IsNullOrWhiteSpace(tenantId))
        {
            var profile = await workspaceProfiles.GetAsync(tenantId, ct);
            timeZoneId = profile?.TimeZoneId;
        }

        var tz = ResolveTimeZone(timeZoneId);
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        return DateOnly.FromDateTime(localNow);
    }

    public static string ResolveEffectiveTimeZoneId(FacilitySettings? settings, WorkspaceProfile? workspaceProfile)
    {
        if (!string.IsNullOrWhiteSpace(settings?.TimeZoneId))
            return settings.TimeZoneId.Trim();
        if (!string.IsNullOrWhiteSpace(workspaceProfile?.TimeZoneId))
            return workspaceProfile.TimeZoneId.Trim();
        return DefaultTimeZoneId;
    }

    public static string ResolveEffectiveDateFormat(FacilitySettings? settings, WorkspaceProfile? workspaceProfile)
    {
        if (!string.IsNullOrWhiteSpace(settings?.DateFormat))
            return settings.DateFormat.Trim();
        if (!string.IsNullOrWhiteSpace(workspaceProfile?.DateFormat))
            return workspaceProfile.DateFormat.Trim();
        return DefaultDateFormat;
    }

    public static string ResolveEffectiveTimeFormat(FacilitySettings? settings)
    {
        if (!string.IsNullOrWhiteSpace(settings?.TimeFormat))
        {
            var tf = settings.TimeFormat.Trim();
            if (tf.Equals("24h", StringComparison.OrdinalIgnoreCase) || tf.Equals("HH:mm", StringComparison.Ordinal))
                return "24h";
            return "12h";
        }
        return DefaultTimeFormat;
    }

    public static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
    {
        var candidate = string.IsNullOrWhiteSpace(timeZoneId) ? DefaultTimeZoneId : timeZoneId.Trim();
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(candidate);
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(DefaultTimeZoneId);
            }
            catch
            {
                return TimeZoneInfo.CreateCustomTimeZone("PHT", TimeSpan.FromHours(8), "Philippine Standard Time", "PHT");
            }
        }
    }

    public static string FormatDate(DateTime date, string? dateFormat = null)
    {
        var pattern = string.IsNullOrWhiteSpace(dateFormat) ? DefaultDateFormat : dateFormat.Trim();
        try
        {
            return date.ToString(pattern, CultureInfo.InvariantCulture);
        }
        catch
        {
            return date.ToString(DefaultDateFormat, CultureInfo.InvariantCulture);
        }
    }

    public static string FormatTime(DateTime localTime, string? timeFormat = null)
    {
        var is24h = !string.IsNullOrWhiteSpace(timeFormat) &&
                    (timeFormat.Trim().Equals("24h", StringComparison.OrdinalIgnoreCase) ||
                     timeFormat.Trim().Equals("HH:mm", StringComparison.Ordinal));
        return localTime.ToString(is24h ? "HH:mm" : "hh:mm tt", CultureInfo.InvariantCulture);
    }

    public static string FormatDateTime(DateTime utcDateTime, string? timeZoneId = null, string? dateFormat = null, string? timeFormat = null)
    {
        var tz = ResolveTimeZone(timeZoneId);
        var normalizedUtc = utcDateTime.Kind == DateTimeKind.Utc
            ? utcDateTime
            : DateTime.SpecifyKind(utcDateTime, DateTimeKind.Utc);
        var local = TimeZoneInfo.ConvertTimeFromUtc(normalizedUtc, tz);
        return $"{FormatDate(local, dateFormat)} {FormatTime(local, timeFormat)}";
    }
}
