using System;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.CustomFields.Helpers;

public static class CustomFieldVisibilityRuleNormalizer
{
    public static async Task<string?> NormalizeAndValidateAsync(
        string? visibilityRuleJson,
        string targetEntityType,
        IRepository<ClinicCustomFieldDefinition> repo,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(visibilityRuleJson))
        {
            return visibilityRuleJson;
        }

        JsonObject jsonObj;
        try
        {
            var node = JsonNode.Parse(visibilityRuleJson);
            if (node is not JsonObject obj)
            {
                return visibilityRuleJson;
            }
            jsonObj = obj;
        }
        catch (JsonException)
        {
            return visibilityRuleJson;
        }

        // Check source
        string? sourceVal = null;
        foreach (var prop in jsonObj)
        {
            if (string.Equals(prop.Key, "source", StringComparison.OrdinalIgnoreCase))
            {
                if (prop.Value is JsonValue jVal && jVal.TryGetValue<string>(out var s))
                {
                    sourceVal = s;
                }
                break;
            }
        }

        if (string.Equals(sourceVal?.Trim(), "static", StringComparison.OrdinalIgnoreCase))
        {
            return visibilityRuleJson;
        }

        // Extract parent field key
        string? fieldKey = null;
        foreach (var prop in jsonObj)
        {
            if (string.Equals(prop.Key, "field", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(prop.Key, "fieldKey", StringComparison.OrdinalIgnoreCase))
            {
                if (prop.Value is JsonValue jVal && jVal.TryGetValue<string>(out var s))
                {
                    fieldKey = s;
                }
                break;
            }
        }

        if (string.IsNullOrWhiteSpace(fieldKey))
        {
            return visibilityRuleJson;
        }

        var entityType = string.IsNullOrWhiteSpace(targetEntityType) ? "ClinicPatient" : targetEntityType.Trim();
        var normalizedParentKey = fieldKey.Trim().ToLowerInvariant().Replace(" ", "_");

        var parentField = await repo.Query().FirstOrDefaultAsync(f =>
            f.EntityType == entityType &&
            f.FieldKey == normalizedParentKey, ct);

        if (parentField == null || parentField.DataType != CustomFieldDataType.Boolean)
        {
            return visibilityRuleJson;
        }

        // Parent field is CustomFieldDataType.Boolean! Validate and normalize:
        string? opPropName = null;
        JsonNode? opNode = null;
        foreach (var prop in jsonObj)
        {
            if (string.Equals(prop.Key, "operator", StringComparison.OrdinalIgnoreCase))
            {
                opPropName = prop.Key;
                opNode = prop.Value;
                break;
            }
        }

        if (opNode == null || opNode is not JsonValue opValue || !opValue.TryGetValue<string>(out var opStr) || string.IsNullOrWhiteSpace(opStr))
        {
            throw new ValidationException("Visibility rule operator is required for boolean parent fields.");
        }

        var op = opStr.Trim().ToLowerInvariant();
        if (op != "equals" && op != "not_equals" && op != "not_empty")
        {
            throw new ValidationException($"Operator '{opStr}' is not supported for boolean parent fields. Allowed operators: equals, not_equals, not_empty.");
        }

        // Canonicalize operator to lowercase
        if (opPropName != null && opPropName != "operator")
        {
            jsonObj.Remove(opPropName);
        }
        jsonObj["operator"] = op;

        if (op == "equals" || op == "not_equals")
        {
            string? valPropName = null;
            JsonNode? valNode = null;
            bool hasValProp = false;
            foreach (var prop in jsonObj)
            {
                if (string.Equals(prop.Key, "value", StringComparison.OrdinalIgnoreCase))
                {
                    valPropName = prop.Key;
                    valNode = prop.Value;
                    hasValProp = true;
                    break;
                }
            }

            if (!hasValProp || valNode == null)
            {
                throw new ValidationException("Visibility rule value is required for boolean comparison.");
            }

            var valueKind = valNode.GetValueKind();
            string canonicalBool;
            switch (valueKind)
            {
                case JsonValueKind.True:
                    canonicalBool = "true";
                    break;
                case JsonValueKind.False:
                    canonicalBool = "false";
                    break;
                case JsonValueKind.String:
                    var str = valNode.GetValue<string>()?.Trim();
                    if (string.IsNullOrWhiteSpace(str))
                    {
                        throw new ValidationException("Visibility rule value cannot be empty for boolean comparison.");
                    }
                    if (string.Equals(str, "true", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(str, "yes", StringComparison.OrdinalIgnoreCase))
                    {
                        canonicalBool = "true";
                    }
                    else if (string.Equals(str, "false", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(str, "no", StringComparison.OrdinalIgnoreCase))
                    {
                        canonicalBool = "false";
                    }
                    else
                    {
                        throw new ValidationException($"Invalid boolean value '{str}'. Expected 'true', 'false', 'yes', or 'no'.");
                    }
                    break;
                case JsonValueKind.Number:
                    throw new ValidationException("Visibility rule value cannot be a number for boolean comparison.");
                case JsonValueKind.Null:
                case JsonValueKind.Undefined:
                    throw new ValidationException("Visibility rule value cannot be null or empty for boolean comparison.");
                case JsonValueKind.Array:
                case JsonValueKind.Object:
                    throw new ValidationException("Visibility rule value cannot be an array or object for boolean comparison.");
                default:
                    throw new ValidationException($"Visibility rule value must be a boolean or boolean string ('true', 'false', 'yes', 'no'), but got {valueKind}.");
            }

            if (valPropName != null && valPropName != "value")
            {
                jsonObj.Remove(valPropName);
            }
            jsonObj["value"] = canonicalBool;
        }

        return jsonObj.ToJsonString();
    }
}
