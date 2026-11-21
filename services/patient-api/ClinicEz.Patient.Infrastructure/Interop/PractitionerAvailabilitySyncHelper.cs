using System.Globalization;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;

namespace ClinicEz.Patient.Infrastructure.Interop;

internal static class PractitionerAvailabilitySyncHelper
{
    public static async Task SyncExistingProviderAvailabilitiesAsync(
        ApplicationDbContext dbContext,
        ClinicHealthcareProvider provider,
        IReadOnlyList<ProviderAvailabilityWindowDto>? availabilities,
        CancellationToken ct)
    {
        if (availabilities is null)
            return;

        var desired = ParseUniqueWindows(availabilities);
        var desiredKeys = desired
            .Select(w => (w.DayOfWeek, w.StartTime, w.EndTime))
            .ToHashSet();

        var existingList = provider.ProviderAvailabilities.ToList();
        var existingKeys = new HashSet<(DayOfWeek, TimeSpan, TimeSpan)>();

        foreach (var existing in existingList)
        {
            var key = (existing.DayOfWeek, existing.StartTime, existing.EndTime);
            if (!desiredKeys.Contains(key))
            {
                dbContext.ProviderAvailabilities.Remove(existing);
                provider.ProviderAvailabilities.Remove(existing);
            }
            else
            {
                existing.IsActive = true;
                existing.IsDeleted = false;
                existingKeys.Add(key);
            }
        }

        foreach (var window in desired)
        {
            if (existingKeys.Contains(window))
                continue;

            var entity = new ProviderAvailability
            {
                Id = Guid.NewGuid(),
                ClinicHealthcareProviderId = provider.Id,
                DayOfWeek = window.DayOfWeek,
                StartTime = window.StartTime,
                EndTime = window.EndTime,
                IsActive = true
            };
            await dbContext.ProviderAvailabilities.AddAsync(entity, ct);
        }
    }

    public static List<ProviderAvailability> BuildNewProviderAvailabilities(
        Guid clinicHealthcareProviderId,
        IReadOnlyList<ProviderAvailabilityWindowDto>? availabilities)
    {
        if (availabilities is null || availabilities.Count == 0)
            return [];

        return ParseUniqueWindows(availabilities)
            .Select(w => new ProviderAvailability
            {
                Id = Guid.NewGuid(),
                ClinicHealthcareProviderId = clinicHealthcareProviderId,
                DayOfWeek = w.DayOfWeek,
                StartTime = w.StartTime,
                EndTime = w.EndTime,
                IsActive = true
            })
            .ToList();
    }

    private static List<(DayOfWeek DayOfWeek, TimeSpan StartTime, TimeSpan EndTime)> ParseUniqueWindows(
        IReadOnlyList<ProviderAvailabilityWindowDto> availabilities)
    {
        var result = new List<(DayOfWeek, TimeSpan, TimeSpan)>();
        var seen = new HashSet<(DayOfWeek, TimeSpan, TimeSpan)>();

        foreach (var window in availabilities)
        {
            if (!TryParseTime(window.StartTime, out var start) ||
                !TryParseTime(window.EndTime, out var end) ||
                end <= start)
            {
                continue;
            }

            var key = (window.DayOfWeek, start, end);
            if (seen.Add(key))
                result.Add(key);
        }

        return result;
    }

    private static bool TryParseTime(string? raw, out TimeSpan result)
    {
        result = default;
        if (string.IsNullOrWhiteSpace(raw))
            return false;

        var trimmed = raw.Trim();
        if (TimeSpan.TryParse(trimmed, CultureInfo.InvariantCulture, out result))
            return result >= TimeSpan.Zero && result < TimeSpan.FromDays(1);

        if (TimeOnly.TryParse(trimmed, CultureInfo.InvariantCulture, out var timeOnly))
        {
            result = timeOnly.ToTimeSpan();
            return true;
        }

        return false;
    }
}
