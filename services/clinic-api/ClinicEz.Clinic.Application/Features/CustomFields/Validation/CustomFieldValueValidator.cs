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

public sealed record PatientStaticContext(
    string? Sex = null,
    string? CivilStatus = null,
    DateOnly? DateOfBirth = null,
    int? Age = null,
    IDictionary<string, object?>? AdditionalProperties = null)
{
    public static PatientStaticContext FromPatient(Patient patient)
    {
        var today = CustomFieldValueValidator.GetTodayInClinic();
        var age = CalculateAge(patient.DateOfBirth, today);
        return new PatientStaticContext(
            Sex: patient.Sex.ToString(),
            CivilStatus: patient.CivilStatus?.ToString(),
            DateOfBirth: patient.DateOfBirth,
            Age: age);
    }

    public static int CalculateAge(DateOnly dob, DateOnly asOfDate)
    {
        var age = asOfDate.Year - dob.Year;
        if (dob > asOfDate.AddYears(-age)) age--;
        return Math.Max(0, age);
    }
}

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

    public static bool TryGetCustomFieldValue(
        IDictionary<string, object?>? dict,
        string key,
        out object? value)
    {
        value = null;
        if (dict == null || string.IsNullOrWhiteSpace(key))
            return false;

        if (dict.TryGetValue(key, out value))
            return true;

        foreach (var kvp in dict)
        {
            if (string.Equals(kvp.Key, key, StringComparison.OrdinalIgnoreCase))
            {
                value = kvp.Value;
                return true;
            }
        }

        return false;
    }

    public static bool? ParseBooleanState(JsonElement elem)
    {
        return elem.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => ParseBooleanState(elem.GetString()),
            _ => null
        };
    }

    public static bool? ParseBooleanState(object? value)
    {
        if (value is null)
            return null;

        if (value is bool b)
            return b;

        if (value is JsonElement elem)
            return ParseBooleanState(elem);

        if (value is string s)
        {
            var trimmed = s.Trim().ToLowerInvariant();
            if (trimmed == "true" || trimmed == "yes")
                return true;
            if (trimmed == "false" || trimmed == "no")
                return false;
        }

        return null;
    }

    private static string ExtractString(object? val)
    {
        if (val is null) return string.Empty;
        if (val is JsonElement elem) return ExtractStringFromElement(elem);
        return val.ToString() ?? string.Empty;
    }

    private static string ExtractStringFromElement(JsonElement elem)
    {
        return elem.ValueKind switch
        {
            JsonValueKind.String => elem.GetString() ?? string.Empty,
            JsonValueKind.Null or JsonValueKind.Undefined => string.Empty,
            _ => elem.GetRawText()
        };
    }

    /// <summary>
    /// Evaluates visibilityRuleJson against the provided custom field values and patient static context.
    /// Fails open (returns true) if the rule is empty or malformed.
    /// Parity matches frontend DynamicCustomFieldsRenderer.isFieldVisible.
    /// </summary>
    public static bool IsFieldVisible(
        CustomFieldDefinition field,
        IDictionary<string, object?>? values,
        PatientStaticContext? staticValues = null)
    {
        if (string.IsNullOrWhiteSpace(field.VisibilityRuleJson))
            return true;

        try
        {
            using var doc = JsonDocument.Parse(field.VisibilityRuleJson);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                return true;

            string? source = null;
            if (root.TryGetProperty("source", out var srcElem) && srcElem.ValueKind == JsonValueKind.String)
            {
                source = srcElem.GetString();
            }

            string? fieldName = null;
            if (root.TryGetProperty("field", out var fElem) && fElem.ValueKind == JsonValueKind.String)
            {
                fieldName = fElem.GetString();
            }
            else if (root.TryGetProperty("fieldKey", out var fkElem) && fkElem.ValueKind == JsonValueKind.String)
            {
                fieldName = fkElem.GetString();
            }

            if (string.IsNullOrWhiteSpace(fieldName))
                return true;

            string op = "equals";
            if (root.TryGetProperty("operator", out var opElem) && opElem.ValueKind == JsonValueKind.String)
            {
                op = opElem.GetString()?.Trim().ToLowerInvariant() ?? "equals";
            }
            else if (root.TryGetProperty("op", out var opShortElem) && opShortElem.ValueKind == JsonValueKind.String)
            {
                op = opShortElem.GetString()?.Trim().ToLowerInvariant() ?? "equals";
            }

            object? actualValue = null;
            if (string.Equals(source?.Trim(), "static", StringComparison.OrdinalIgnoreCase))
            {
                var lowerField = fieldName.Trim().ToLowerInvariant();
                if (lowerField == "sex" || lowerField == "gender")
                {
                    actualValue = staticValues?.Sex;
                }
                else if (lowerField == "civilstatus" || lowerField == "civil_status")
                {
                    actualValue = staticValues?.CivilStatus;
                }
                else if (lowerField == "dateofbirth" || lowerField == "date_of_birth" || lowerField == "dob")
                {
                    actualValue = staticValues?.DateOfBirth?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                }
                else if (lowerField == "age")
                {
                    if (staticValues?.Age.HasValue == true)
                    {
                        actualValue = staticValues.Age.Value.ToString();
                    }
                    else if (staticValues?.DateOfBirth.HasValue == true)
                    {
                        actualValue = PatientStaticContext.CalculateAge(staticValues.DateOfBirth.Value, GetTodayInClinic()).ToString();
                    }
                }
                else if (staticValues?.AdditionalProperties != null &&
                         TryGetCustomFieldValue(staticValues.AdditionalProperties, fieldName, out var addVal))
                {
                    actualValue = addVal;
                }
            }
            else
            {
                if (!TryGetCustomFieldValue(values, fieldName, out actualValue))
                {
                    // Fallback: If querying "affiliation", check if "classification" exists
                    if (string.Equals(fieldName, "affiliation", StringComparison.OrdinalIgnoreCase) &&
                        TryGetCustomFieldValue(values, "classification", out var clsVal))
                    {
                        var clsStr = clsVal?.ToString()?.Trim();
                        if (string.Equals(clsStr, "Student", StringComparison.OrdinalIgnoreCase))
                            actualValue = "Student";
                        else if (string.Equals(clsStr, "Employee", StringComparison.OrdinalIgnoreCase))
                            actualValue = "Employee/Faculty";
                        else
                            actualValue = clsVal;
                    }
                }
            }

            bool isUnanswered = actualValue is null ||
                                (actualValue is string s && string.IsNullOrWhiteSpace(s)) ||
                                (actualValue is JsonElement elem && (elem.ValueKind == JsonValueKind.Null || elem.ValueKind == JsonValueKind.Undefined || (elem.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(elem.GetString()))));

            root.TryGetProperty("value", out var ruleValElem);

            switch (op)
            {
                case "equals":
                {
                    var ruleBool = ParseBooleanState(ruleValElem);
                    if (ruleBool != null)
                    {
                        if (isUnanswered) return false;
                        var actualBool = ParseBooleanState(actualValue);
                        return actualBool == ruleBool;
                    }

                    var ruleStr = ExtractStringFromElement(ruleValElem);
                    var actualStr = ExtractString(actualValue);
                    return string.Equals(actualStr.Trim(), ruleStr.Trim(), StringComparison.OrdinalIgnoreCase);
                }

                case "not_equals":
                {
                    var ruleBool = ParseBooleanState(ruleValElem);
                    if (ruleBool != null)
                    {
                        if (isUnanswered) return false;
                        var actualBool = ParseBooleanState(actualValue);
                        if (actualBool == null) return false;
                        return actualBool != ruleBool;
                    }

                    var ruleStr = ExtractStringFromElement(ruleValElem);
                    var actualStr = ExtractString(actualValue);
                    return !string.Equals(actualStr.Trim(), ruleStr.Trim(), StringComparison.OrdinalIgnoreCase);
                }

                case "in":
                {
                    if (ruleValElem.ValueKind == JsonValueKind.Array)
                    {
                        var ruleItems = ruleValElem.EnumerateArray().ToList();
                        var ruleBools = ruleItems.Select(ParseBooleanState).ToList();
                        bool isAllBool = ruleItems.Count > 0 && ruleBools.All(b => b != null);

                        if (isAllBool)
                        {
                            if (isUnanswered) return false;
                            var actualBool = ParseBooleanState(actualValue);
                            return actualBool != null && ruleBools.Contains(actualBool);
                        }

                        var actualStr = ExtractString(actualValue).Trim();
                        return ruleItems.Any(item =>
                            string.Equals(ExtractStringFromElement(item).Trim(), actualStr, StringComparison.OrdinalIgnoreCase));
                    }
                    return false;
                }

                case "contains":
                {
                    var ruleStr = ExtractStringFromElement(ruleValElem);
                    var actualStr = ExtractString(actualValue);
                    return actualStr.Contains(ruleStr, StringComparison.OrdinalIgnoreCase);
                }

                case "not_empty":
                {
                    return !isUnanswered;
                }

                default:
                    return true;
            }
        }
        catch
        {
            // Malformed rule fails open to visible
            return true;
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
        string entityType = "Patient",
        PatientStaticContext? staticContext = null)
    {
        var activeDefs = definitions
            .Where(d => d.IsActive && IsMatchingEntityType(d.EntityType, entityType))
            .ToList();

        var defMap = new Dictionary<string, CustomFieldDefinition>(StringComparer.OrdinalIgnoreCase);
        foreach (var def in activeDefs)
        {
            defMap[def.FieldKey] = def;
        }

        // 1. Mandatory field validation (only for fields evaluating as visible)
        foreach (var def in activeDefs)
        {
            if (def.IsRequired && IsFieldVisible(def, customFields, staticContext))
            {
                if (customFields == null ||
                    !TryGetCustomFieldValue(customFields, def.FieldKey, out var fieldVal) ||
                    IsBlankOrCleared(fieldVal))
                {
                    throw new ValidationException($"{def.Label} is required.");
                }
            }
        }

        if (customFields == null || customFields.Count == 0)
            return;

        // 2. Remove any defined custom field that evaluates as hidden (matches sanitizeCustomFieldsPayload)
        foreach (var def in activeDefs)
        {
            if (!IsFieldVisible(def, customFields, staticContext))
            {
                if (TryGetCustomFieldValue(customFields, def.FieldKey, out _))
                {
                    customFields.Remove(def.FieldKey);
                    var caseMatch = customFields.Keys
                        .FirstOrDefault(k => string.Equals(k, def.FieldKey, StringComparison.OrdinalIgnoreCase));
                    if (caseMatch != null)
                    {
                        customFields.Remove(caseMatch);
                    }
                }
            }
        }

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

    public static Task ValidateAndNormalizeAsync(
        IDictionary<string, object?> customFields,
        IRepository<CustomFieldDefinition> repo,
        string entityType,
        CancellationToken ct)
        => ValidateAndNormalizeAsync(customFields, repo, entityType, null, ct);

    public static async Task ValidateAndNormalizeAsync(
        IDictionary<string, object?> customFields,
        IRepository<CustomFieldDefinition> repo,
        string entityType = "Patient",
        PatientStaticContext? staticContext = null,
        CancellationToken ct = default)
    {
        var definitions = await FetchDefinitionsAsync(repo, entityType, ct);
        ValidateAndNormalize(customFields, definitions, entityType, staticContext);
    }

    public static void MergeAndValidateForUpdate(
        IDictionary<string, object?> targetCustomFields,
        IDictionary<string, object?> submittedCustomFields,
        IEnumerable<CustomFieldDefinition> definitions,
        string entityType = "Patient",
        PatientStaticContext? staticContext = null)
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
            // Verify mandatory fields are present in target for visible fields
            foreach (var def in activeDefs)
            {
                if (def.IsRequired && IsFieldVisible(def, targetCustomFields, staticContext))
                {
                    if (!TryGetCustomFieldValue(targetCustomFields, def.FieldKey, out var fieldVal) || IsBlankOrCleared(fieldVal))
                    {
                        throw new ValidationException($"{def.Label} is required.");
                    }
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

                    bool hasExisting = TryGetCustomFieldValue(targetCustomFields, def.FieldKey, out var existingRaw);
                    var existingStr = existingRaw switch
                    {
                        null => null,
                        string s => s.Trim(),
                        JsonElement elem when elem.ValueKind == JsonValueKind.String => elem.GetString()?.Trim(),
                        JsonElement elem when elem.ValueKind == JsonValueKind.Null || elem.ValueKind == JsonValueKind.Undefined => null,
                        JsonElement elem => elem.ToString()?.Trim(),
                        _ => existingRaw.ToString()?.Trim()
                    };

                    bool isUnmodified = hasExisting && (
                        string.Equals(existingStr, rawString, StringComparison.OrdinalIgnoreCase) ||
                        (DateOnly.TryParseExact(existingStr, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var existingDate) && existingDate == dateVal)
                    );

                    if (!isUnmodified)
                    {
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

        // Purge any active definition that has become conditionally hidden
        foreach (var def in activeDefs)
        {
            if (!IsFieldVisible(def, targetCustomFields, staticContext))
            {
                targetCustomFields.Remove(def.FieldKey);
                var caseMatch = targetCustomFields.Keys
                    .FirstOrDefault(k => string.Equals(k, def.FieldKey, StringComparison.OrdinalIgnoreCase));
                if (caseMatch != null)
                {
                    targetCustomFields.Remove(caseMatch);
                }
            }
        }

        // Verify all required fields remain present in targetCustomFields ONLY if visible
        foreach (var def in activeDefs)
        {
            if (def.IsRequired && IsFieldVisible(def, targetCustomFields, staticContext))
            {
                if (!TryGetCustomFieldValue(targetCustomFields, def.FieldKey, out var val) || IsBlankOrCleared(val))
                {
                    throw new ValidationException($"{def.Label} is required.");
                }
            }
        }
    }

    public static Task MergeAndValidateForUpdateAsync(
        IDictionary<string, object?> targetCustomFields,
        IDictionary<string, object?> submittedCustomFields,
        IRepository<CustomFieldDefinition> repo,
        string entityType,
        CancellationToken ct)
        => MergeAndValidateForUpdateAsync(targetCustomFields, submittedCustomFields, repo, entityType, null, ct);

    public static async Task MergeAndValidateForUpdateAsync(
        IDictionary<string, object?> targetCustomFields,
        IDictionary<string, object?> submittedCustomFields,
        IRepository<CustomFieldDefinition> repo,
        string entityType = "Patient",
        PatientStaticContext? staticContext = null,
        CancellationToken ct = default)
    {
        var definitions = await FetchDefinitionsAsync(repo, entityType, ct);
        MergeAndValidateForUpdate(targetCustomFields, submittedCustomFields, definitions, entityType, staticContext);
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
