using System;

namespace ClinicEz.Clinic.Application.Common;

public static class PatientAge
{
    /// <summary>Completed years between <paramref name="dateOfBirth"/> and <paramref name="today"/>.</summary>
    public static int InYears(DateOnly dateOfBirth, DateOnly today)
    {
        var years = today.Year - dateOfBirth.Year;
        if (today < dateOfBirth.AddYears(years)) years--;
        return Math.Max(years, 0);
    }
}
