using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// Status constants for annual PhilHealth YAKAP benefit enlistment periods.
/// </summary>
public static class YakapEnlistmentStatus
{
    public const string Active = "Active";
    public const string Expired = "Expired";
    public const string Transferred = "Transferred";
}

/// <summary>
/// Source origin constants for PhilHealth YAKAP benefit enlistments.
/// </summary>
public static class YakapEnlistmentSource
{
    public const string PhilHealthMasterlist = "PhilHealthMasterlist";
    public const string ClinicEnlistment = "ClinicEnlistment";
    public const string SelfReported = "SelfReported";
}

/// <summary>
/// Represents a single annual PhilHealth YAKAP statutory enlistment period stored
/// within ClinicPatient.CustomFields["yakap_enlistments"].
/// </summary>
public sealed record YakapEnlistmentEntry
{
    /// <summary>
    /// Statutory date when patient was enlisted into PhilHealth Konsulta (Yakap) for this benefit year (YYYY-MM-DD).
    /// Supports past dates (e.g. when patient enlisted earlier via eGovPH or Member Portal).
    /// </summary>
    [JsonPropertyName("enlisted_at")]
    public string EnlistedAt { get; set; } = string.Empty;

    /// <summary>
    /// Date until which the enlistment is valid (YYYY-MM-DD). Default is YYYY-12-31 of effective_year or +1 year from enlisted_at.
    /// </summary>
    [JsonPropertyName("valid_until")]
    public string ValidUntil { get; set; } = string.Empty;

    /// <summary>
    /// PhilHealth benefit year (e.g. 2026).
    /// Marked with AllowReadingFromString to accept both JSON numbers (2026) and strings ("2026").
    /// </summary>
    [JsonPropertyName("effective_year")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public int EffectiveYear { get; set; }

    /// <summary>
    /// Operational status: "Active" | "Expired" | "Transferred".
    /// </summary>
    [JsonPropertyName("status")]
    public string Status { get; set; } = YakapEnlistmentStatus.Active;

    /// <summary>
    /// Origin of registration: "PhilHealthMasterlist" | "ClinicEnlistment" | "SelfReported".
    /// </summary>
    [JsonPropertyName("source")]
    public string Source { get; set; } = YakapEnlistmentSource.ClinicEnlistment;

    /// <summary>
    /// 20-21 character PhilHealth Case Number (pHciCaseNo) allocated for this benefit year, e.g. "C000921202600001".
    /// </summary>
    [JsonPropertyName("case_no")]
    public string? CaseNo { get; set; }

    /// <summary>
    /// 20-21 character Enlistment Transaction Number (pHciTransNo on &lt;ENLISTMENT&gt;), e.g. "E000921202600001".
    /// </summary>
    [JsonPropertyName("enlistment_no")]
    public string? EnlistmentNo { get; set; }

    /// <summary>
    /// 20-21 character Profiling Transaction Number (pHciTransNo on &lt;PROFILE&gt;), e.g. "P000921202600001".
    /// </summary>
    [JsonPropertyName("profiling_trans_no")]
    public string? ProfilingTransNo { get; set; }

    /// <summary>
    /// Determines whether the reference date falls within [EnlistedAt, ValidUntil].
    /// </summary>
    public bool IsCoveringDate(DateOnly referenceDate)
    {
        if (DateOnly.TryParse(EnlistedAt, out var start) && DateOnly.TryParse(ValidUntil, out var end))
        {
            return referenceDate >= start && referenceDate <= end;
        }

        return EffectiveYear == referenceDate.Year;
    }

    /// <summary>
    /// Overload for DateTime.
    /// </summary>
    public bool IsCoveringDate(DateTime referenceDate) => IsCoveringDate(DateOnly.FromDateTime(referenceDate));

    /// <summary>
    /// Returns true if the entry is Active and covers the specified reference date.
    /// </summary>
    public bool IsActiveOn(DateOnly referenceDate)
    {
        return string.Equals(Status, YakapEnlistmentStatus.Active, StringComparison.OrdinalIgnoreCase) &&
               IsCoveringDate(referenceDate);
    }

    /// <summary>
    /// Overload for DateTime.
    /// </summary>
    public bool IsActiveOn(DateTime referenceDate) => IsActiveOn(DateOnly.FromDateTime(referenceDate));

    /// <summary>
    /// Converts this entry to a dictionary matching CustomFields JSONB storage convention.
    /// </summary>
    public Dictionary<string, object?> ToDictionary() => new()
    {
        ["enlisted_at"] = EnlistedAt,
        ["valid_until"] = ValidUntil,
        ["effective_year"] = EffectiveYear,
        ["status"] = Status,
        ["source"] = Source,
        ["case_no"] = CaseNo,
        ["enlistment_no"] = EnlistmentNo,
        ["profiling_trans_no"] = ProfilingTransNo
    };
}
