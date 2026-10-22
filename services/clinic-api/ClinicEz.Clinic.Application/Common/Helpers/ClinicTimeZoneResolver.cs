using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Workspace;

namespace ClinicEz.Clinic.Application.Common.Helpers;

/// <summary>
/// Resolves the active clinic/workspace calendar date (<see cref="DateOnly"/>) and local time
/// using the tenant's configured <see cref="WorkspaceProfile.TimeZoneId"/> (defaulting to "Asia/Manila").
/// </summary>
public static class ClinicTimeZoneResolver
{
    public const string DefaultTimeZoneId = "Asia/Manila";

    /// <summary>
    /// Resolves today's calendar date in the tenant's configured timezone when <paramref name="workspaceProfiles"/>
    /// is available in DI (falling back to "Asia/Manila"). When <paramref name="workspaceProfiles"/> is null
    /// (e.g. in isolated unit tests that instantiate handlers without DI), falls back to <c>DateTime.UtcNow</c>.
    /// </summary>
    public static async Task<DateOnly> ResolveTodayAsync(
        IWorkspaceProfileProvider? workspaceProfiles,
        string? tenantId,
        CancellationToken ct = default)
    {
        if (workspaceProfiles is null)
        {
            return DateOnly.FromDateTime(DateTime.UtcNow);
        }

        string? timeZoneId = null;
        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            var profile = await workspaceProfiles.GetAsync(tenantId, ct);
            timeZoneId = profile?.TimeZoneId;
        }

        var tz = ResolveTimeZone(timeZoneId);
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        return DateOnly.FromDateTime(localNow);
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
}
