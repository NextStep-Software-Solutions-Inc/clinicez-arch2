using System;

namespace ClinicEz.Shared.Common;

/// <summary>
/// Provides extension methods for normalizing <see cref="DateTime"/> instances to UTC,
/// preventing Npgsql / PostgreSQL <c>timestamp with time zone</c> exceptions when queries receive
/// <see cref="DateTimeKind.Unspecified"/> values from model binding or unannotated date strings.
/// </summary>
public static class DateTimeExtensions
{
    /// <summary>
    /// Returns a new <see cref="DateTime"/> representing the start of the day (00:00:00 UTC)
    /// with <see cref="DateTimeKind.Utc"/> guaranteed.
    /// </summary>
    public static DateTime ToStartOfDayUtc(this DateTime dt)
    {
        return DateTime.SpecifyKind(dt.Date, DateTimeKind.Utc);
    }

    /// <summary>
    /// Returns a new <see cref="DateTime"/> representing the start of the next day (00:00:00 UTC)
    /// with <see cref="DateTimeKind.Utc"/> guaranteed. Useful as an exclusive upper bound in range queries.
    /// </summary>
    public static DateTime ToEndOfDayExclusiveUtc(this DateTime dt)
    {
        return DateTime.SpecifyKind(dt.Date.AddDays(1), DateTimeKind.Utc);
    }

    /// <summary>
    /// Ensures that the specified <see cref="DateTime"/> has <see cref="DateTimeKind.Utc"/>.
    /// If <see cref="DateTimeKind.Unspecified"/>, specifies Utc.
    /// If <see cref="DateTimeKind.Local"/>, converts to universal time.
    /// </summary>
    public static DateTime AsUtc(this DateTime dt)
    {
        return dt.Kind switch
        {
            DateTimeKind.Utc => dt,
            DateTimeKind.Unspecified => DateTime.SpecifyKind(dt, DateTimeKind.Utc),
            DateTimeKind.Local => dt.ToUniversalTime(),
            _ => DateTime.SpecifyKind(dt, DateTimeKind.Utc)
        };
    }
}
