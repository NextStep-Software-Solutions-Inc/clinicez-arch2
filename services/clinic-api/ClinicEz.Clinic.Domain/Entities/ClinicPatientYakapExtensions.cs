using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// Domain extension methods for ClinicPatient providing safe extraction, mutation,
/// and statutory lifecycle guarding of CustomFields["yakap_enlistments"].
/// </summary>
public static class ClinicPatientYakapExtensions
{
    public const string YakapEnlistmentsKey = "yakap_enlistments";

    /// <summary>
    /// Safely extracts and parses all YAKAP enlistments from ClinicPatient.CustomFields["yakap_enlistments"].
    /// Robustly handles JsonElement (EF Core JSONB), List&lt;Dictionary&lt;string, object?&gt;&gt; (in-memory/seeders),
    /// raw JSON strings, and untyped enumerables. Returns items sorted chronologically.
    /// </summary>
    public static List<YakapEnlistmentEntry> GetYakapEnlistments(this ClinicPatient? patient)
    {
        if (patient?.CustomFields == null)
        {
            return new List<YakapEnlistmentEntry>();
        }

        if (!patient.CustomFields.TryGetValue(YakapEnlistmentsKey, out var raw) || raw == null)
        {
            return new List<YakapEnlistmentEntry>();
        }

        var results = new List<YakapEnlistmentEntry>();

        try
        {
            if (raw is List<YakapEnlistmentEntry> directList)
            {
                results.AddRange(directList);
            }
            else if (raw is IEnumerable<YakapEnlistmentEntry> typedEnum)
            {
                results.AddRange(typedEnum);
            }
            else if (raw is JsonElement elem)
            {
                if (elem.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in elem.EnumerateArray())
                    {
                        var entry = ParseJsonElement(item);
                        if (entry != null) results.Add(entry);
                    }
                }
                else if (elem.ValueKind == JsonValueKind.String)
                {
                    ParseJsonString(elem.GetString(), results);
                }
            }
            else if (raw is string str)
            {
                ParseJsonString(str, results);
            }
            else if (raw is IEnumerable enumerable)
            {
                foreach (var item in enumerable)
                {
                    if (item is YakapEnlistmentEntry typedItem)
                    {
                        results.Add(typedItem);
                    }
                    else if (item is IDictionary<string, object?> dict)
                    {
                        results.Add(ParseDictionary(dict));
                    }
                    else if (item is JsonElement itemElem)
                    {
                        var entry = ParseJsonElement(itemElem);
                        if (entry != null) results.Add(entry);
                    }
                    else if (item != null)
                    {
                        var entry = ParseObjectFallback(item);
                        if (entry != null) results.Add(entry);
                    }
                }
            }
        }
        catch
        {
            // Defensive: return whatever was successfully parsed rather than failing
        }

        return results
            .OrderBy(e => e.EffectiveYear)
            .ThenBy(e => e.EnlistedAt)
            .ToList();
    }

    /// <summary>
    /// Persists the list of YAKAP enlistments into ClinicPatient.CustomFields["yakap_enlistments"]
    /// in chronological order, formatted as List&lt;Dictionary&lt;string, object?&gt;&gt; for maximum
    /// compatibility with EF Core's JSONB converter and existing in-memory tests.
    /// </summary>
    public static void SetYakapEnlistments(this ClinicPatient patient, IEnumerable<YakapEnlistmentEntry> enlistments)
    {
        ArgumentNullException.ThrowIfNull(patient);
        patient.CustomFields ??= new Dictionary<string, object?>();

        var sortedDictionaries = (enlistments ?? Enumerable.Empty<YakapEnlistmentEntry>())
            .OrderBy(e => e.EffectiveYear)
            .ThenBy(e => e.EnlistedAt)
            .Select(e => e.ToDictionary())
            .ToList();

        patient.CustomFields[YakapEnlistmentsKey] = sortedDictionaries;
    }

    /// <summary>
    /// Adds a new annual YAKAP enlistment or updates an existing benefit-year entry,
    /// strictly preserving all historical entries from prior years in chronological order.
    /// Retains already assigned control numbers (case_no, enlistment_no, profiling_trans_no)
    /// if updating an existing year unless explicitly replaced.
    /// </summary>
    public static void AddOrRenewYakapEnlistment(this ClinicPatient patient, YakapEnlistmentEntry newEnlistment)
    {
        ArgumentNullException.ThrowIfNull(patient);
        ArgumentNullException.ThrowIfNull(newEnlistment);

        var list = patient.GetYakapEnlistments();

        var effYear = newEnlistment.EffectiveYear;
        if (effYear <= 0)
        {
            effYear = DateOnly.TryParse(newEnlistment.EnlistedAt, out var d) ? d.Year : DateTime.UtcNow.Year;
        }

        var validUntil = newEnlistment.ValidUntil;
        if (string.IsNullOrWhiteSpace(validUntil))
        {
            validUntil = $"{effYear}-12-31";
        }

        var normalized = newEnlistment with
        {
            EffectiveYear = effYear,
            ValidUntil = validUntil,
            Status = string.IsNullOrWhiteSpace(newEnlistment.Status) ? YakapEnlistmentStatus.Active : newEnlistment.Status,
            Source = string.IsNullOrWhiteSpace(newEnlistment.Source) ? YakapEnlistmentSource.ClinicEnlistment : newEnlistment.Source
        };

        var existingIndex = list.FindIndex(e => e.EffectiveYear == normalized.EffectiveYear);
        if (existingIndex >= 0)
        {
            var current = list[existingIndex];
            list[existingIndex] = normalized with
            {
                CaseNo = !string.IsNullOrWhiteSpace(normalized.CaseNo) ? normalized.CaseNo : current.CaseNo,
                EnlistmentNo = !string.IsNullOrWhiteSpace(normalized.EnlistmentNo) ? normalized.EnlistmentNo : current.EnlistmentNo,
                ProfilingTransNo = !string.IsNullOrWhiteSpace(normalized.ProfilingTransNo) ? normalized.ProfilingTransNo : current.ProfilingTransNo
            };
        }
        else
        {
            list.Add(normalized);
        }

        patient.SetYakapEnlistments(list);
    }

    /// <summary>
    /// Retrieves the active YAKAP enlistment covering the given reference date.
    /// Returns null if no active entry covers the date.
    /// </summary>
    public static YakapEnlistmentEntry? GetActiveYakapEnlistment(this ClinicPatient? patient, DateOnly referenceDate)
    {
        return patient?.GetYakapEnlistments().FirstOrDefault(e => e.IsActiveOn(referenceDate));
    }

    /// <summary>
    /// Overload for DateTime.
    /// </summary>
    public static YakapEnlistmentEntry? GetActiveYakapEnlistment(this ClinicPatient? patient, DateTime referenceDate)
    {
        return patient.GetActiveYakapEnlistment(DateOnly.FromDateTime(referenceDate));
    }

    /// <summary>
    /// Enforces the statutory Strict No-Auto-Renewal Guard for journey number allocation.
    /// Resolves the active enlistment covering the reference date, or throws an InvalidOperationException
    /// with an exact statutory error message if the enlistment is missing, expired, or transferred.
    /// </summary>
    public static YakapEnlistmentEntry ResolveActiveEnlistmentOrThrow(
        this ClinicPatient patient,
        DateOnly referenceDate,
        int? effectiveYear = null)
    {
        ArgumentNullException.ThrowIfNull(patient);

        var list = patient.GetYakapEnlistments();
        if (list.Count == 0)
        {
            throw new InvalidOperationException(
                $"Patient has no active PhilHealth YAKAP enlistment covering the encounter date {referenceDate:yyyy-MM-dd}. An explicit annual renewal must be recorded before assigning journey control numbers.");
        }

        var targetYear = effectiveYear ?? referenceDate.Year;

        // Check for transferred entry matching benefit year or covering reference date
        var transferred = list.FirstOrDefault(e =>
            string.Equals(e.Status, YakapEnlistmentStatus.Transferred, StringComparison.OrdinalIgnoreCase) &&
            (e.EffectiveYear == targetYear || e.IsCoveringDate(referenceDate)));

        if (transferred != null)
        {
            throw new InvalidOperationException(
                $"Patient PhilHealth YAKAP enlistment for benefit year {transferred.EffectiveYear} is marked as Transferred. Cannot assign journey numbers.");
        }

        // 1. Check for entry actively covering referenceDate:
        // Must strictly satisfy enlisted_at <= referenceDate && valid_until >= referenceDate && status == "Active"
        var active = list.FirstOrDefault(e =>
            e.IsActiveOn(referenceDate) &&
            (!effectiveYear.HasValue || e.EffectiveYear == effectiveYear.Value));

        if (active != null)
        {
            return active;
        }

        // 2. Pre-enlistment encounter check:
        // If an entry exists for that benefit year (or matching referenceDate year) where referenceDate < enlisted_at:
        var preEnlistment = list.FirstOrDefault(e =>
            (e.EffectiveYear == targetYear || (DateOnly.TryParse(e.EnlistedAt, out var s) && s.Year == referenceDate.Year)) &&
            DateOnly.TryParse(e.EnlistedAt, out var start) &&
            referenceDate < start);

        if (preEnlistment != null)
        {
            throw new InvalidOperationException(
                $"Patient has no active PhilHealth YAKAP enlistment covering the encounter date {referenceDate:yyyy-MM-dd}. An explicit annual renewal must be recorded before assigning journey control numbers.");
        }

        // 3. Expired encounter check:
        // If an entry exists where referenceDate > valid_until or status is Expired:
        var expiredEntry = list
            .Where(e => string.Equals(e.Status, YakapEnlistmentStatus.Expired, StringComparison.OrdinalIgnoreCase) ||
                        (DateOnly.TryParse(e.ValidUntil, out var vu) && vu < referenceDate))
            .OrderByDescending(e => effectiveYear.HasValue && e.EffectiveYear == effectiveYear.Value ? 1 : 0)
            .ThenByDescending(e => e.EffectiveYear)
            .ThenByDescending(e => e.ValidUntil)
            .FirstOrDefault();

        if (expiredEntry != null)
        {
            throw new InvalidOperationException(
                $"Patient has no active PhilHealth YAKAP enlistment covering the encounter date {referenceDate:yyyy-MM-dd} (enlistment expired on {expiredEntry.ValidUntil}). An explicit annual renewal must be recorded before assigning journey control numbers.");
        }

        throw new InvalidOperationException(
            $"Patient has no active PhilHealth YAKAP enlistment covering the encounter date {referenceDate:yyyy-MM-dd}. An explicit annual renewal must be recorded before assigning journey control numbers.");
    }

    /// <summary>
    /// Enforces the statutory Strict No-Auto-Renewal Guard for patient-level registration key allocation
    /// for a specific benefit year (when no specific encounter or reference date is provided).
    /// </summary>
    public static YakapEnlistmentEntry ResolveActiveEnlistmentForYearOrThrow(
        this ClinicPatient patient,
        int effectiveYear)
    {
        ArgumentNullException.ThrowIfNull(patient);

        var list = patient.GetYakapEnlistments();
        if (list.Count == 0)
        {
            throw new InvalidOperationException(
                $"Patient has no active PhilHealth YAKAP enlistment for benefit year {effectiveYear}. An explicit annual renewal must be recorded before assigning journey control numbers.");
        }

        var transferred = list.FirstOrDefault(e =>
            e.EffectiveYear == effectiveYear &&
            string.Equals(e.Status, YakapEnlistmentStatus.Transferred, StringComparison.OrdinalIgnoreCase));

        if (transferred != null)
        {
            throw new InvalidOperationException(
                $"Patient PhilHealth YAKAP enlistment for benefit year {transferred.EffectiveYear} is marked as Transferred. Cannot assign journey numbers.");
        }

        var active = list.FirstOrDefault(e =>
            e.EffectiveYear == effectiveYear &&
            string.Equals(e.Status, YakapEnlistmentStatus.Active, StringComparison.OrdinalIgnoreCase));

        if (active != null)
        {
            return active;
        }

        var expired = list.FirstOrDefault(e =>
            e.EffectiveYear == effectiveYear &&
            string.Equals(e.Status, YakapEnlistmentStatus.Expired, StringComparison.OrdinalIgnoreCase));

        if (expired != null)
        {
            var expiredMsg = !string.IsNullOrWhiteSpace(expired.ValidUntil)
                ? $"Patient PhilHealth YAKAP enlistment for benefit year {effectiveYear} (enlistment expired on {expired.ValidUntil}) is marked as Expired. Cannot assign journey numbers."
                : $"Patient PhilHealth YAKAP enlistment for benefit year {effectiveYear} is marked as Expired. Cannot assign journey numbers.";
            throw new InvalidOperationException(expiredMsg);
        }

        throw new InvalidOperationException(
            $"Patient has no active PhilHealth YAKAP enlistment for benefit year {effectiveYear}. An explicit annual renewal must be recorded before assigning journey control numbers.");
    }

    /// <summary>
    /// Overload for DateTime? referenceDate.
    /// If referenceDate is provided, resolves strictly by date window.
    /// If referenceDate is null but effectiveYear is provided, resolves by benefit year.
    /// </summary>
    public static YakapEnlistmentEntry ResolveActiveEnlistmentOrThrow(
        this ClinicPatient patient,
        DateTime? referenceDate = null,
        int? effectiveYear = null)
    {
        if (referenceDate.HasValue)
        {
            return patient.ResolveActiveEnlistmentOrThrow(DateOnly.FromDateTime(referenceDate.Value), effectiveYear);
        }

        if (effectiveYear.HasValue)
        {
            return patient.ResolveActiveEnlistmentForYearOrThrow(effectiveYear.Value);
        }

        return patient.ResolveActiveEnlistmentOrThrow(DateOnly.FromDateTime(DateTime.UtcNow));
    }

    #region Private Deserialization Parsers

    private static void ParseJsonString(string? json, List<YakapEnlistmentEntry> results)
    {
        if (string.IsNullOrWhiteSpace(json)) return;

        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                var entry = ParseJsonElement(item);
                if (entry != null) results.Add(entry);
            }
        }
    }

    private static YakapEnlistmentEntry? ParseJsonElement(JsonElement elem)
    {
        if (elem.ValueKind != JsonValueKind.Object) return null;

        string enlistedAt = string.Empty;
        if (elem.TryGetProperty("enlisted_at", out var ea) || elem.TryGetProperty("EnlistedAt", out ea))
            enlistedAt = ea.GetString() ?? string.Empty;

        string validUntil = string.Empty;
        if (elem.TryGetProperty("valid_until", out var vu) || elem.TryGetProperty("ValidUntil", out vu))
            validUntil = vu.GetString() ?? string.Empty;

        int effectiveYear = 0;
        if (elem.TryGetProperty("effective_year", out var ey) || elem.TryGetProperty("EffectiveYear", out ey))
        {
            if (ey.ValueKind == JsonValueKind.Number && ey.TryGetInt32(out var yrInt))
                effectiveYear = yrInt;
            else if (ey.ValueKind == JsonValueKind.String && int.TryParse(ey.GetString(), out var yrParsed))
                effectiveYear = yrParsed;
        }

        if (effectiveYear <= 0 && DateOnly.TryParse(enlistedAt, out var d))
            effectiveYear = d.Year;
        if (effectiveYear <= 0)
            effectiveYear = DateTime.UtcNow.Year;

        if (string.IsNullOrWhiteSpace(validUntil))
            validUntil = $"{effectiveYear}-12-31";

        string status = YakapEnlistmentStatus.Active;
        if (elem.TryGetProperty("status", out var st) || elem.TryGetProperty("Status", out st))
            status = st.GetString() ?? YakapEnlistmentStatus.Active;

        string source = YakapEnlistmentSource.ClinicEnlistment;
        if (elem.TryGetProperty("source", out var src) || elem.TryGetProperty("Source", out src))
            source = src.GetString() ?? YakapEnlistmentSource.ClinicEnlistment;

        string? caseNo = null;
        if (elem.TryGetProperty("case_no", out var cn) || elem.TryGetProperty("CaseNo", out cn))
            caseNo = cn.GetString();

        string? enlistmentNo = null;
        if (elem.TryGetProperty("enlistment_no", out var en) || elem.TryGetProperty("EnlistmentNo", out en))
            enlistmentNo = en.GetString();

        string? profilingTransNo = null;
        if (elem.TryGetProperty("profiling_trans_no", out var pt) || elem.TryGetProperty("ProfilingTransNo", out pt))
            profilingTransNo = pt.GetString();

        return new YakapEnlistmentEntry
        {
            EnlistedAt = enlistedAt,
            ValidUntil = validUntil,
            EffectiveYear = effectiveYear,
            Status = status,
            Source = source,
            CaseNo = string.IsNullOrWhiteSpace(caseNo) ? null : caseNo,
            EnlistmentNo = string.IsNullOrWhiteSpace(enlistmentNo) ? null : enlistmentNo,
            ProfilingTransNo = string.IsNullOrWhiteSpace(profilingTransNo) ? null : profilingTransNo
        };
    }

    private static YakapEnlistmentEntry ParseDictionary(IDictionary<string, object?> dict)
    {
        var lookup = dict is Dictionary<string, object?> d && d.Comparer == StringComparer.OrdinalIgnoreCase
            ? d
            : new Dictionary<string, object?>(dict, StringComparer.OrdinalIgnoreCase);

        var enlistedAt = GetString(lookup, "enlisted_at", "EnlistedAt") ?? string.Empty;
        var validUntil = GetString(lookup, "valid_until", "ValidUntil") ?? string.Empty;
        var status = GetString(lookup, "status", "Status") ?? YakapEnlistmentStatus.Active;
        var source = GetString(lookup, "source", "Source") ?? YakapEnlistmentSource.ClinicEnlistment;
        var caseNo = GetString(lookup, "case_no", "CaseNo");
        var enlistmentNo = GetString(lookup, "enlistment_no", "EnlistmentNo");
        var profilingTransNo = GetString(lookup, "profiling_trans_no", "ProfilingTransNo");

        int effectiveYear = 0;
        if (TryExtractYear(lookup, out var extractedYear))
        {
            effectiveYear = extractedYear;
        }
        else if (DateOnly.TryParse(enlistedAt, out var enlistDate))
        {
            effectiveYear = enlistDate.Year;
        }
        else
        {
            effectiveYear = DateTime.UtcNow.Year;
        }

        if (string.IsNullOrWhiteSpace(validUntil))
        {
            validUntil = $"{effectiveYear}-12-31";
        }

        return new YakapEnlistmentEntry
        {
            EnlistedAt = enlistedAt,
            ValidUntil = validUntil,
            EffectiveYear = effectiveYear,
            Status = status,
            Source = source,
            CaseNo = string.IsNullOrWhiteSpace(caseNo) ? null : caseNo,
            EnlistmentNo = string.IsNullOrWhiteSpace(enlistmentNo) ? null : enlistmentNo,
            ProfilingTransNo = string.IsNullOrWhiteSpace(profilingTransNo) ? null : profilingTransNo
        };
    }

    private static YakapEnlistmentEntry? ParseObjectFallback(object obj)
    {
        try
        {
            var json = JsonSerializer.Serialize(obj);
            using var doc = JsonDocument.Parse(json);
            return ParseJsonElement(doc.RootElement);
        }
        catch
        {
            return null;
        }
    }

    private static bool TryExtractYear(Dictionary<string, object?> lookup, out int year)
    {
        year = 0;
        object? val = null;
        if (!lookup.TryGetValue("effective_year", out val) && !lookup.TryGetValue("EffectiveYear", out val))
        {
            return false;
        }

        if (val == null) return false;

        if (val is int i) { year = i; return true; }
        if (val is long l) { year = (int)l; return true; }
        if (val is short s) { year = s; return true; }
        if (val is JsonElement je)
        {
            if (je.ValueKind == JsonValueKind.Number && je.TryGetInt32(out var num))
            {
                year = num;
                return true;
            }
            if (je.ValueKind == JsonValueKind.String && int.TryParse(je.GetString(), out var parsedStr))
            {
                year = parsedStr;
                return true;
            }
        }

        if (int.TryParse(val.ToString(), out var parsed))
        {
            year = parsed;
            return true;
        }

        return false;
    }

    private static string? GetString(Dictionary<string, object?> lookup, string key1, string key2)
    {
        if (lookup.TryGetValue(key1, out var v1) && v1 != null) return v1.ToString();
        if (lookup.TryGetValue(key2, out var v2) && v2 != null) return v2.ToString();
        return null;
    }

    #endregion
}
