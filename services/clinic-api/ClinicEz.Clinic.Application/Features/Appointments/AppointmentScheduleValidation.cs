using System;
using ClinicEz.Clinic.Application.Common.Helpers;

namespace ClinicEz.Clinic.Application.Features.Appointments;

public static class AppointmentScheduleValidation
{
    public static readonly TimeSpan PastScheduleGraceWindow = TimeSpan.FromMinutes(5);

    public static DateTime NormalizeToUtc(DateTime scheduledAt)
    {
        return scheduledAt.Kind switch
        {
            DateTimeKind.Utc => scheduledAt,
            DateTimeKind.Local => scheduledAt.ToUniversalTime(),
            _ => TimeZoneInfo.ConvertTimeToUtc(
                DateTime.SpecifyKind(scheduledAt, DateTimeKind.Unspecified),
                ClinicTimeZoneResolver.ResolveTimeZone(ClinicTimeZoneResolver.DefaultTimeZoneId))
        };
    }

    public static bool IsInPast(DateTime scheduledAt, TimeProvider? timeProvider = null)
    {
        if (scheduledAt == default)
        {
            return true;
        }

        var utcNow = (timeProvider ?? TimeProvider.System).GetUtcNow().UtcDateTime;
        var scheduledUtc = NormalizeToUtc(scheduledAt);
        return scheduledUtc < utcNow - PastScheduleGraceWindow;
    }
}
