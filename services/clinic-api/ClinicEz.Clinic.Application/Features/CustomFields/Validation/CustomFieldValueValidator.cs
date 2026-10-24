using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
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

    public static void ValidateAndNormalize(
        IDictionary<string, object?> customFields,
        IEnumerable<ClinicCustomFieldDefinition> definitions,
        string entityType = "ClinicPatient")
    {
        if (customFields == null || customFields.Count == 0)
            return;

        var activeDefs = definitions
            .Where(d => d.IsActive && string.Equals(d.EntityType, entityType, StringComparison.OrdinalIgnoreCase))
            .ToList();

        var defMap = new Dictionary<string, ClinicCustomFieldDefinition>(StringComparer.OrdinalIgnoreCase);
        foreach (var def in activeDefs)
        {
            defMap[def.FieldKey] = def;
        }

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
        IRepository<ClinicCustomFieldDefinition> repo,
        string entityType = "ClinicPatient",
        CancellationToken ct = default)
    {
        var definitions = await FetchDefinitionsAsync(repo, entityType, ct);
        ValidateAndNormalize(customFields, definitions, entityType);
    }

    public static void MergeAndValidateForUpdate(
        IDictionary<string, object?> targetCustomFields,
        IDictionary<string, object?> submittedCustomFields,
        IEnumerable<ClinicCustomFieldDefinition> definitions,
        string entityType = "ClinicPatient")
    {
        if (submittedCustomFields == null || submittedCustomFields.Count == 0)
            return;

        var activeDefs = definitions
            .Where(d => d.IsActive && string.Equals(d.EntityType, entityType, StringComparison.OrdinalIgnoreCase))
            .ToList();

        var defMap = new Dictionary<string, ClinicCustomFieldDefinition>(StringComparer.OrdinalIgnoreCase);
        foreach (var def in activeDefs)
        {
            defMap[def.FieldKey] = def;
        }

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
    }

    public static async Task MergeAndValidateForUpdateAsync(
        IDictionary<string, object?> targetCustomFields,
        IDictionary<string, object?> submittedCustomFields,
        IRepository<ClinicCustomFieldDefinition> repo,
        string entityType = "ClinicPatient",
        CancellationToken ct = default)
    {
        var definitions = await FetchDefinitionsAsync(repo, entityType, ct);
        MergeAndValidateForUpdate(targetCustomFields, submittedCustomFields, definitions, entityType);
    }

    private static async Task<List<ClinicCustomFieldDefinition>> FetchDefinitionsAsync(
        IRepository<ClinicCustomFieldDefinition> repo,
        string entityType,
        CancellationToken ct)
    {
        var query = repo.Query().Where(f => f.IsActive && f.EntityType == entityType);
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
