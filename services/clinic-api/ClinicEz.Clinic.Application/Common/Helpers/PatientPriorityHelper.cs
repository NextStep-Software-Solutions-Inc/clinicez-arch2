using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Common.Helpers;

public static class PatientPriorityHelper
{
    public static bool IsSeniorOrPwd(
        DateOnly dateOfBirth,
        string? seniorCitizenId,
        string? pwdId,
        IReadOnlyDictionary<string, object?>? customFields,
        DateOnly referenceDate)
    {
        if (!string.IsNullOrWhiteSpace(seniorCitizenId))
            return true;

        if (!string.IsNullOrWhiteSpace(pwdId))
            return true;

        if (customFields != null && HasPriorityCustomFields(customFields))
            return true;

        var seniorCutoff = referenceDate.AddYears(-60);
        return dateOfBirth <= seniorCutoff;
    }

    public static bool IsSeniorOrPwd(Patient patient, DateOnly referenceDate)
    {
        return IsSeniorOrPwd(
            patient.DateOfBirth,
            patient.SeniorCitizenId,
            patient.PwdId,
            patient.CustomFields,
            referenceDate);
    }

    private static bool HasPriorityCustomFields(IReadOnlyDictionary<string, object?> customFields)
    {
        string[] priorityKeys = ["seniorCitizenId", "senior_id", "pwdId", "pwd_id"];
        foreach (var key in priorityKeys)
        {
            if (customFields.TryGetValue(key, out var val) && val != null && !string.IsNullOrWhiteSpace(val.ToString()))
            {
                return true;
            }
        }
        return false;
    }

    public static string ResolveSeriesPrefix(
        VisitType visitType,
        bool isPriority,
        string? explicitPrefix = null)
    {
        if (!string.IsNullOrWhiteSpace(explicitPrefix))
        {
            var cleaned = explicitPrefix.Trim().TrimEnd('-').ToUpperInvariant();
            if (!string.IsNullOrWhiteSpace(cleaned))
                return cleaned;
        }

        return visitType switch
        {
            VisitType.VitalsCheckOnly => isPriority ? "SV" : "V",
            VisitType.StandaloneProcedure => isPriority ? "SP" : "P",
            VisitType.AdministrativeDocument => isPriority ? "SA" : "A",
            _ => isPriority ? "SQ" : "Q"
        };
    }
}
