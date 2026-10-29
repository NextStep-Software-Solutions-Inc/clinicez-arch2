using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.CustomFields.Validation;

public static class CustomFieldValueValidator
{
    private static readonly Regex NumericRegex = new(@"^-?\d+(\.\d+)?$", RegexOptions.Compiled);

    public static bool IsBlankOrCleared(object? value)
    {
        if (value is null)
            return true;

        if (value is string s)
            return string.IsNullOrWhiteSpace(s);

        if (value is JsonElement elem)
        {
            return elem.ValueKind switch
            {
                JsonValueKind.Null or JsonValueKind.Undefined => true,
                JsonValueKind.String => string.IsNullOrWhiteSpace(elem.GetString()),
                _ => false
            };
        }

        return false;
    }

    public static bool IsValidNumber(object? value)
    {
        if (value is null)
            return false;

        if (value is byte or sbyte or short or ushort or int or uint or long or ulong or decimal)
            return true;

        if (value is float f)
            return !float.IsNaN(f) && !float.IsInfinity(f);

        if (value is double d)
            return !double.IsNaN(d) && !double.IsInfinity(d);

        if (value is JsonElement elem)
        {
            if (elem.ValueKind == JsonValueKind.Number)
                return true;

            if (elem.ValueKind == JsonValueKind.String)
            {
                var str = elem.GetString();
                if (string.IsNullOrWhiteSpace(str)) return false;
                var trimmed = str.Trim();
                return NumericRegex.IsMatch(trimmed) &&
                       double.TryParse(trimmed, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) &&
                       !double.IsNaN(parsed) && !double.IsInfinity(parsed);
            }

            return false;
        }

        if (value is string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return false;
            var trimmed = s.Trim();
            return NumericRegex.IsMatch(trimmed) &&
                   double.TryParse(trimmed, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) &&
                   !double.IsNaN(parsed) && !double.IsInfinity(parsed);
        }

        return false;
    }

    public static object? NormalizeValue(object? val)
    {
        if (val is null) return null;

        if (val is string s)
            return s.Trim();

        if (val is JsonElement elem)
        {
            return elem.ValueKind switch
            {
                JsonValueKind.String => elem.GetString()?.Trim(),
                JsonValueKind.Number => elem.TryGetInt64(out var l) ? l : (elem.TryGetDecimal(out var dec) ? dec : elem.GetDouble()),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                _ => elem
            };
        }

        return val;
    }

    public static DateOnly GetTodayInClinic()
    {
        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila");
            return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        }
        catch
        {
            return DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
        }
    }

    private static bool IsMatchingEntityType(string definitionEntityType, string targetEntityType)
    {
        if (string.Equals(definitionEntityType, targetEntityType, StringComparison.OrdinalIgnoreCase))
            return true;

        if ((string.Equals(targetEntityType, "Patient", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(targetEntityType, "ClinicPatient", StringComparison.OrdinalIgnoreCase)) &&
            (string.Equals(definitionEntityType, "Patient", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(definitionEntityType, "ClinicPatient", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return false;
    }

    public static void ValidateAndNormalize(
        IDictionary<string, object?> customFields,
        IEnumerable<CustomFieldDefinition> definitions,
        string entityType = "Patient")
    {
        var activeDefs = definitions
            .Where(d => d.IsActive && IsMatchingEntityType(d.EntityType, entityType))
            .ToList();

        var defMap = new Dictionary<string, CustomFieldDefinition>(StringComparer.OrdinalIgnoreCase);
        foreach (var def in activeDefs)
        {
            defMap[def.FieldKey] = def;
        }

        // 1. Mandatory field validation
        foreach (var def in activeDefs)
        {
            if (def.IsRequired)
            {
                if (customFields == null ||
                    !customFields.TryGetValue(def.FieldKey, out var fieldVal) ||
                    IsBlankOrCleared(fieldVal))
                {
                    throw new ValidationException($"{def.Label} is required.");
                }
            }
        }

        if (customFields == null || customFields.Count == 0)
            return;

        var todayInClinic = GetTodayInClinic();

        foreach (var kvp in customFields.ToList())
        {
            if (defMap.TryGetValue(kvp.Key, out var def))
            {
                if (IsBlankOrCleared(kvp.Value))
                {
                    customFields.Remove(kvp.Key);
                    if (!string.Equals(kvp.Key, def.FieldKey, StringComparison.Ordinal))
                    {
                        customFields.Remove(def.FieldKey);
                    }
                }
                else if (def.DataType == CustomFieldDataType.Number && !IsValidNumber(kvp.Value))
                {
                    throw new ValidationException($"{def.Label} must be a valid number.");
                }
                else if (def.DataType == CustomFieldDataType.Date)
                {
                    var rawString = kvp.Value?.ToString()?.Trim();
                    if (!DateOnly.TryParseExact(rawString, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateVal))
                    {
                        throw new ValidationException($"{def.Label} must be a valid date in YYYY-MM-DD format.");
                    }

                    switch (def.BoundaryMode?.Trim().ToLowerInvariant())
                    {
                        case "pastortoday":
                            if (dateVal > todayInClinic)
                                throw new ValidationException($"{def.Label} cannot be a future date (maximum allowed: {todayInClinic:yyyy-MM-dd}).");
                            break;

                        case "futureortoday":
                            if (dateVal < todayInClinic)
                                throw new ValidationException($"{def.Label} cannot be a past date (minimum allowed: {todayInClinic:yyyy-MM-dd}).");
                            break;

                        case "futureonly":
                            if (dateVal <= todayInClinic)
                                throw new ValidationException($"{def.Label} must be a future date after {todayInClinic:yyyy-MM-dd}.");
                            break;
                    }

                    if (!string.Equals(kvp.Key, def.FieldKey, StringComparison.Ordinal))
                    {
                        customFields.Remove(kvp.Key);
                    }
                    customFields[def.FieldKey] = dateVal.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                }
                else
                {
                    if (!string.Equals(kvp.Key, def.FieldKey, StringComparison.Ordinal))
                    {
                        customFields.Remove(kvp.Key);
                    }
                    customFields[def.FieldKey] = NormalizeValue(kvp.Value);
                }
            }
            // Untyped keys without matching active definition are preserved untouched
        }
    }

    public static async Task ValidateAndNormalizeAsync(
        IDictionary<string, object?> customFields,
        IRepository<CustomFieldDefinition> repo,
        string entityType = "Patient",
        CancellationToken ct = default)
    {
        var definitions = await FetchDefinitionsAsync(repo, entityType, ct);
        ValidateAndNormalize(customFields, definitions, entityType);
    }

    public static void MergeAndValidateForUpdate(
        IDictionary<string, object?> targetCustomFields,
        IDictionary<string, object?> submittedCustomFields,
        IEnumerable<CustomFieldDefinition> definitions,
        string entityType = "Patient")
    {
        var activeDefs = definitions
            .Where(d => d.IsActive && IsMatchingEntityType(d.EntityType, entityType))
            .ToList();

        var defMap = new Dictionary<string, CustomFieldDefinition>(StringComparer.OrdinalIgnoreCase);
        foreach (var def in activeDefs)
        {
            defMap[def.FieldKey] = def;
        }

        if (submittedCustomFields == null || submittedCustomFields.Count == 0)
        {
            // Verify mandatory fields are present in target
            foreach (var def in activeDefs)
            {
                if (def.IsRequired && (!targetCustomFields.TryGetValue(def.FieldKey, out var fieldVal) || IsBlankOrCleared(fieldVal)))
                {
                    throw new ValidationException($"{def.Label} is required.");
                }
            }
            return;
        }

        var todayInClinic = GetTodayInClinic();

        foreach (var kvp in submittedCustomFields)
        {
            if (defMap.TryGetValue(kvp.Key, out var def))
            {
                if (IsBlankOrCleared(kvp.Value))
                {
                    if (def.IsRequired)
                    {
                        throw new ValidationException($"{def.Label} is required.");
                    }

                    targetCustomFields.Remove(kvp.Key);
                    targetCustomFields.Remove(def.FieldKey);
                    var caseMatch = targetCustomFields.Keys
                        .FirstOrDefault(k => string.Equals(k, def.FieldKey, StringComparison.OrdinalIgnoreCase));
                    if (caseMatch != null)
                    {
                        targetCustomFields.Remove(caseMatch);
                    }
                }
                else if (def.DataType == CustomFieldDataType.Number && !IsValidNumber(kvp.Value))
                {
                    throw new ValidationException($"{def.Label} must be a valid number.");
                }
                else if (def.DataType == CustomFieldDataType.Date)
                {
                    var rawString = kvp.Value?.ToString()?.Trim();
                    if (!DateOnly.TryParseExact(rawString, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateVal))
                    {
                        throw new ValidationException($"{def.Label} must be a valid date in YYYY-MM-DD format.");
                    }

                    switch (def.BoundaryMode?.Trim().ToLowerInvariant())
                    {
                        case "pastortoday":
                            if (dateVal > todayInClinic)
                                throw new ValidationException($"{def.Label} cannot be a future date (maximum allowed: {todayInClinic:yyyy-MM-dd}).");
                            break;

                        case "futureortoday":
                            if (dateVal < todayInClinic)
                                throw new ValidationException($"{def.Label} cannot be a past date (minimum allowed: {todayInClinic:yyyy-MM-dd}).");
                            break;

                        case "futureonly":
                            if (dateVal <= todayInClinic)
                                throw new ValidationException($"{def.Label} must be a future date after {todayInClinic:yyyy-MM-dd}.");
                            break;
                    }

                    var caseMatch = targetCustomFields.Keys
                        .FirstOrDefault(k => string.Equals(k, def.FieldKey, StringComparison.OrdinalIgnoreCase));
                    if (caseMatch != null && !string.Equals(caseMatch, def.FieldKey, StringComparison.Ordinal))
                    {
                        targetCustomFields.Remove(caseMatch);
                    }
                    targetCustomFields[def.FieldKey] = dateVal.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                }
                else
                {
                    var caseMatch = targetCustomFields.Keys
                        .FirstOrDefault(k => string.Equals(k, def.FieldKey, StringComparison.OrdinalIgnoreCase));
                    if (caseMatch != null && !string.Equals(caseMatch, def.FieldKey, StringComparison.Ordinal))
                    {
                        targetCustomFields.Remove(caseMatch);
                    }
                    targetCustomFields[def.FieldKey] = NormalizeValue(kvp.Value);
                }
            }
            else
            {
                // Untyped key without matching active definition: preserve raw dictionary roundtrip semantics
                targetCustomFields[kvp.Key] = kvp.Value;
            }
        }

        // Verify all required fields remain present in targetCustomFields
        foreach (var def in activeDefs)
        {
            if (def.IsRequired && (!targetCustomFields.TryGetValue(def.FieldKey, out var val) || IsBlankOrCleared(val)))
            {
                throw new ValidationException($"{def.Label} is required.");
            }
        }
    }

    public static async Task MergeAndValidateForUpdateAsync(
        IDictionary<string, object?> targetCustomFields,
        IDictionary<string, object?> submittedCustomFields,
        IRepository<CustomFieldDefinition> repo,
        string entityType = "Patient",
        CancellationToken ct = default)
    {
        var definitions = await FetchDefinitionsAsync(repo, entityType, ct);
        MergeAndValidateForUpdate(targetCustomFields, submittedCustomFields, definitions, entityType);
    }

    private static async Task<List<CustomFieldDefinition>> FetchDefinitionsAsync(
        IRepository<CustomFieldDefinition> repo,
        string entityType,
        CancellationToken ct)
    {
        var query = repo.Query().Where(f => f.IsActive && (
            f.EntityType == entityType ||
            ((entityType == "Patient" || entityType == "ClinicPatient") && (f.EntityType == "Patient" || f.EntityType == "ClinicPatient"))));
        try
        {
            return await query.ToListAsync(ct);
        }
        catch (InvalidOperationException)
        {
            return query.ToList();
        }
    }
}
