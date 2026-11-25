using System.Globalization;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Patient.Application.Features.Appointments;

/// <summary>
/// Centralizes clinic-timezone (<c>Asia/Manila</c>, UTC+8) schedule parsing and past-slot validation
/// across slot queries, booking draft creation/submission, and appointment rescheduling.
/// </summary>
public static class BookingScheduleValidation
{
    public const string DefaultTimeZoneId = "Asia/Manila";

    private static readonly string[] SupportedTimeFormats =
    [
        "HH:mm",
        "H:mm",
        "HH:mm:ss",
        "H:mm:ss",
        "h:mm tt",
        "hh:mm tt",
        "h:mmtt",
        "hh:mmtt"
    ];

    public static TimeZoneInfo ResolveManilaTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(DefaultTimeZoneId);
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Singapore Standard Time");
            }
            catch
            {
                return TimeZoneInfo.CreateCustomTimeZone(
                    "PHT",
                    TimeSpan.FromHours(8),
                    "Philippine Standard Time",
                    "PHT");
            }
        }
    }

    public static DateOnly GetManilaToday(TimeProvider? timeProvider = null)
    {
        var utcNow = (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime;
        var manilaNow = TimeZoneInfo.ConvertTimeFromUtc(utcNow, ResolveManilaTimeZone());
        return DateOnly.FromDateTime(manilaNow);
    }

    public static DateTimeOffset ToManilaDateTimeOffset(DateOnly date, TimeOnly time)
    {
        var tz = ResolveManilaTimeZone();
        var local = date.ToDateTime(time, DateTimeKind.Unspecified);
        var offset = tz.GetUtcOffset(local);
        return new DateTimeOffset(local, offset);
    }

    public static DateTime NormalizeToUtc(DateTime scheduledAt)
    {
        return scheduledAt.Kind switch
        {
            DateTimeKind.Utc => scheduledAt,
            DateTimeKind.Local => scheduledAt.ToUniversalTime(),
            _ => TimeZoneInfo.ConvertTimeToUtc(
                DateTime.SpecifyKind(scheduledAt, DateTimeKind.Unspecified),
                ResolveManilaTimeZone())
        };
    }

    public static bool TryParsePreferredTime(string? preferredTime, out TimeOnly parsedTime)
    {
        if (string.IsNullOrWhiteSpace(preferredTime))
        {
            parsedTime = default;
            return false;
        }

        var trimmed = preferredTime.Trim();
        return TimeOnly.TryParseExact(
            trimmed,
            SupportedTimeFormats,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AllowWhiteSpaces,
            out parsedTime);
    }

    public static bool IsSlotInPast(DateOnly date, TimeOnly time, TimeProvider? timeProvider = null)
    {
        var utcNow = (timeProvider ?? TimeProvider.System).GetUtcNow();
        var slotStartUtc = ToManilaDateTimeOffset(date, time);
        return slotStartUtc <= utcNow;
    }

    public static bool IsScheduledAtInPast(DateTime scheduledAt, TimeProvider? timeProvider = null)
    {
        if (scheduledAt == default)
        {
            return true;
        }

        var utcNow = (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime;
        var scheduledUtc = NormalizeToUtc(scheduledAt);
        return scheduledUtc <= utcNow;
    }

    public static bool TryValidateBookingSchedule(
        DateOnly? preferredDate,
        string? preferredTime,
        TimeProvider? timeProvider,
        out string fieldName,
        out string errorMessage)
    {
        var hasTime = !string.IsNullOrWhiteSpace(preferredTime);

        if (!preferredDate.HasValue && !hasTime)
        {
            fieldName = string.Empty;
            errorMessage = string.Empty;
            return true;
        }

        if (!preferredDate.HasValue && hasTime)
        {
            fieldName = "PreferredDate";
            errorMessage = "Preferred date is required when preferred time is specified.";
            return false;
        }

        var date = preferredDate!.Value;
        if (!hasTime)
        {
            if (date < GetManilaToday(timeProvider))
            {
                fieldName = "PreferredDate";
                errorMessage = "Cannot schedule an appointment for a date that has already passed.";
                return false;
            }

            fieldName = string.Empty;
            errorMessage = string.Empty;
            return true;
        }

        if (!TryParsePreferredTime(preferredTime, out var parsedTime))
        {
            fieldName = "PreferredTime";
            errorMessage = "Preferred time must be a valid time (e.g. HH:mm).";
            return false;
        }

        if (IsSlotInPast(date, parsedTime, timeProvider))
        {
            fieldName = "ScheduledAt";
            errorMessage = "Cannot schedule an appointment for a time that has already passed.";
            return false;
        }

        fieldName = string.Empty;
        errorMessage = string.Empty;
        return true;
    }

    public static void ValidateBookingSchedule(
        DateOnly? preferredDate,
        string? preferredTime,
        TimeProvider? timeProvider = null)
    {
        if (TryValidateBookingSchedule(preferredDate, preferredTime, timeProvider, out var fieldName, out var errorMessage))
        {
            return;
        }

        throw new ValidationException(
            errorMessage,
            new Dictionary<string, string[]>
            {
                [fieldName] = [errorMessage]
            });
    }
}
