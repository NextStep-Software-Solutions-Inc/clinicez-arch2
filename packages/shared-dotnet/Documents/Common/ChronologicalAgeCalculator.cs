using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Documents.Common;

public readonly record struct ChronologicalAge(
    int Years,
    int Months,
    int Weeks,
    int Days,
    int TotalDays,
    bool IsNewborn,
    bool IsInfant);

public static class ChronologicalAgeCalculator
{
    private static bool IsLeapYear(int year) =>
        (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);

    public static int GetDaysInMonth(int year, int month)
    {
        if (month < 1 || month > 12) return 30;
        if (month == 2) return IsLeapYear(year) ? 29 : 28;
        if (month == 4 || month == 6 || month == 9 || month == 11) return 30;
        return 31;
    }

    public static ChronologicalAge? Calculate(DateOnly? dateOfBirth, DateOnly? referenceDate = null)
    {
        if (dateOfBirth is null) return null;

        var birth = dateOfBirth.Value;
        var refDate = referenceDate ?? DateOnly.FromDateTime(DateTime.UtcNow);

        int years = refDate.Year - birth.Year;
        int months = refDate.Month - birth.Month;
        int days = refDate.Day - birth.Day;

        // Calendar borrowing for days
        if (days < 0)
        {
            int prevMonth = refDate.Month - 1;
            int prevYear = refDate.Year;
            if (prevMonth < 1)
            {
                prevMonth = 12;
                prevYear -= 1;
            }
            int daysInPrev = GetDaysInMonth(prevYear, prevMonth);
            bool isLeapBabyInNonLeapFeb =
                birth.Month == 2 && birth.Day == 29 && prevMonth == 2 && daysInPrev == 28;

            if (birth.Day > daysInPrev && !isLeapBabyInNonLeapFeb)
            {
                days = refDate.Day;
            }
            else
            {
                days += daysInPrev;
            }
            months -= 1;
        }

        // Calendar borrowing for months
        if (months < 0)
        {
            months += 12;
            years -= 1;
        }

        if (years < 0)
        {
            return new ChronologicalAge(0, 0, 0, 0, 0, true, true);
        }

        bool isNewborn = years == 0 && months == 0;
        bool isInfant = years == 0;

        int totalDays = days;
        int weeks = days / 7;
        int remDays = days % 7;

        return new ChronologicalAge(
            Years: years,
            Months: months,
            Weeks: weeks,
            Days: remDays,
            TotalDays: totalDays,
            IsNewborn: isNewborn,
            IsInfant: isInfant);
    }

    /// <summary>
    /// Formats chronological age into clinical long format:
    /// - Adults/Children: e.g. "33 yrs, 10 mos, 1 wk, 4 days" or "28 yrs"
    /// - Infants: e.g. "3 mos, 2 wks, 4 days"
    /// - Newborns: e.g. "12 days" or "1 day"
    /// </summary>
    public static string FormatLongAge(DateOnly? dateOfBirth, DateOnly? referenceDate = null, int? fallbackYears = null)
    {
        var ageOpt = Calculate(dateOfBirth, referenceDate);
        if (ageOpt is not null)
        {
            var age = ageOpt.Value;

            // Newborn (< 1 month)
            if (age.IsNewborn)
            {
                int d = age.TotalDays;
                return $"{d} {(d == 1 ? "day" : "days")}";
            }

            // Infant (1-12 months, < 1 year)
            if (age.IsInfant)
            {
                var infantParts = new List<string>();
                if (age.Months > 0)
                {
                    infantParts.Add($"{age.Months} {(age.Months == 1 ? "mo" : "mos")}");
                }
                if (age.Weeks > 0)
                {
                    infantParts.Add($"{age.Weeks} {(age.Weeks == 1 ? "wk" : "wks")}");
                }
                if (age.Days > 0)
                {
                    infantParts.Add($"{age.Days} {(age.Days == 1 ? "day" : "days")}");
                }
                return infantParts.Count > 0 ? string.Join(", ", infantParts) : $"{age.Months} mos";
            }

            // Adults and Children (>= 1 year)
            var parts = new List<string>
            {
                $"{age.Years} {(age.Years == 1 ? "yr" : "yrs")}"
            };

            if (age.Months > 0)
            {
                parts.Add($"{age.Months} {(age.Months == 1 ? "mo" : "mos")}");
            }
            if (age.Weeks > 0)
            {
                parts.Add($"{age.Weeks} {(age.Weeks == 1 ? "wk" : "wks")}");
            }
            if (age.Days > 0)
            {
                parts.Add($"{age.Days} {(age.Days == 1 ? "day" : "days")}");
            }

            return string.Join(", ", parts);
        }

        if (fallbackYears is not null && fallbackYears.Value >= 0)
        {
            int y = fallbackYears.Value;
            return $"{y} {(y == 1 ? "yr" : "yrs")}";
        }

        return string.Empty;
    }
}
