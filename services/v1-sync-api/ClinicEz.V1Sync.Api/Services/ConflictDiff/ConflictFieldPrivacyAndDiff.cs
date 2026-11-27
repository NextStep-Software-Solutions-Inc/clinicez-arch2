using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClinicEz.V1Sync.Api.Models;

namespace ClinicEz.V1Sync.Api.Services.ConflictDiff;

public sealed record ConflictFieldSpec(
    string FieldName,
    string Label,
    string Sensitivity
);

public static class ConflictFieldClassifier
{
    private static readonly Regex MultiWhitespaceRegex = new(@"\s+", RegexOptions.Compiled);
    private static readonly Regex StripPunctuationRegex = new(@"[\s\-_.()+/]+", RegexOptions.Compiled);

    public static string Classify(string? v1Value, string? v2Value)
    {
        var v1Empty = string.IsNullOrWhiteSpace(v1Value);
        var v2Empty = string.IsNullOrWhiteSpace(v2Value);

        if (v1Empty && v2Empty)
        {
            return FieldDiffClassification.Unchanged;
        }

        if (v1Empty)
        {
            return FieldDiffClassification.V2FilledEmpty;
        }

        if (v2Empty)
        {
            return FieldDiffClassification.V2ClearedValue;
        }

        if (string.Equals(v1Value, v2Value, StringComparison.Ordinal))
        {
            return FieldDiffClassification.Unchanged;
        }

        if (IsFormatOnlyEquivalent(v1Value!, v2Value!))
        {
            return FieldDiffClassification.FormatOnly;
        }

        return FieldDiffClassification.Modified;
    }

    public static bool IsFormatOnlyEquivalent(string left, string right)
    {
        var normLeft = CollapseWhitespace(left);
        var normRight = CollapseWhitespace(right);
        if (string.Equals(normLeft, normRight, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (decimal.TryParse(normLeft, NumberStyles.Number, CultureInfo.InvariantCulture, out var dLeft) &&
            decimal.TryParse(normRight, NumberStyles.Number, CultureInfo.InvariantCulture, out var dRight) &&
            dLeft == dRight)
        {
            return true;
        }

        if (DateOnly.TryParse(normLeft, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateLeft) &&
            DateOnly.TryParse(normRight, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateRight) &&
            dateLeft == dateRight)
        {
            return true;
        }

        var strippedLeft = StripPunctuationRegex.Replace(normLeft, string.Empty);
        var strippedRight = StripPunctuationRegex.Replace(normRight, string.Empty);
        if (strippedLeft.Length >= 5 &&
            string.Equals(strippedLeft, strippedRight, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (TryCanonicalizeJson(normLeft, out var jsonLeft) &&
            TryCanonicalizeJson(normRight, out var jsonRight) &&
            string.Equals(jsonLeft, jsonRight, StringComparison.Ordinal))
        {
            return true;
        }

        return false;
    }

    private static string CollapseWhitespace(string input) =>
        MultiWhitespaceRegex.Replace(input.Trim(), " ");

    private static bool TryCanonicalizeJson(string raw, out string canonical)
    {
        canonical = string.Empty;
        if (raw.Length < 2 || (raw[0] != '{' && raw[0] != '['))
        {
            return false;
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind == JsonValueKind.Object)
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, object?>>(raw);
                if (dict is not null)
                {
                    canonical = SyncTransforms.SerializeSortedJson(dict);
                    return true;
                }
            }
            canonical = JsonSerializer.Serialize(doc.RootElement);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}

public static class ConflictFieldMasker
{
    private static readonly char[] CsvFormulaPrefixes = ['=', '+', '-', '@', '\t', '\r'];

    public static string? MaskPreview(string fieldName, string sensitivity, string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return null;
        }

        var trimmed = rawValue.Trim();
        return sensitivity switch
        {
            FieldSensitivity.SafeEnumOrBool => trimmed,
            FieldSensitivity.ClinicalNote => $"[Clinical note · redacted ({trimmed.Length} chars)]",
            FieldSensitivity.ClinicalMeasurement => "[Clinical value · masked]",
            FieldSensitivity.StructuredJson => MaskJsonSummary(trimmed),
            _ => MaskPiiValue(fieldName, trimmed)
        };
    }

    public static IReadOnlyList<ConflictSubFieldDiffDto>? BuildJsonSubFieldDiffs(
        string? v1Json,
        string? v2Json,
        bool revealValues)
    {
        var v1Map = ParseFlatJsonObject(v1Json);
        var v2Map = ParseFlatJsonObject(v2Json);
        var allKeys = new SortedSet<string>(v1Map.Keys, StringComparer.Ordinal);
        foreach (var k in v2Map.Keys)
        {
            allKeys.Add(k);
        }

        if (allKeys.Count == 0)
        {
            return null;
        }

        var diffs = new List<ConflictSubFieldDiffDto>(allKeys.Count);
        foreach (var key in allKeys)
        {
            v1Map.TryGetValue(key, out var v1Raw);
            v2Map.TryGetValue(key, out var v2Raw);
            var classification = ConflictFieldClassifier.Classify(v1Raw, v2Raw);
            var isChanged = !string.Equals(classification, FieldDiffClassification.Unchanged, StringComparison.Ordinal);

            diffs.Add(new ConflictSubFieldDiffDto(
                Key: key,
                Classification: classification,
                IsChanged: isChanged,
                V1Preview: MaskPreview(key, FieldSensitivity.PiiMasked, v1Raw),
                V2Preview: MaskPreview(key, FieldSensitivity.PiiMasked, v2Raw),
                V1Value: revealValues ? v1Raw : null,
                V2Value: revealValues ? v2Raw : null
            ));
        }

        return diffs;
    }

    public static string SanitizeCsvCell(string? value)
    {
        var raw = value ?? string.Empty;
        var trimmedStart = raw.TrimStart();
        if (trimmedStart.Length > 0 && Array.IndexOf(CsvFormulaPrefixes, trimmedStart[0]) >= 0)
        {
            raw = "'" + raw;
        }

        if (raw.IndexOfAny([',', '"', '\r', '\n']) >= 0)
        {
            return "\"" + raw.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
        }

        return raw;
    }

    private static string MaskPiiValue(string fieldName, string trimmed)
    {
        var lower = fieldName.ToLowerInvariant();

        if (lower.Contains("email", StringComparison.Ordinal))
        {
            var atIdx = trimmed.IndexOf('@');
            if (atIdx > 0 && atIdx < trimmed.Length - 1)
            {
                var domain = trimmed[(atIdx + 1)..];
                var dotIdx = domain.LastIndexOf('.');
                var tld = dotIdx > 0 && dotIdx < domain.Length - 1 ? domain[(dotIdx + 1)..] : "***";
                return $"{trimmed[0]}***@***.{tld} ({trimmed.Length} chars)";
            }
            return $"***@*** ({trimmed.Length} chars)";
        }

        if (lower.Contains("dob", StringComparison.Ordinal) ||
            lower.Contains("date_of_birth", StringComparison.Ordinal) ||
            lower.Contains("dateofbirth", StringComparison.Ordinal) ||
            lower.Contains("birth", StringComparison.Ordinal) && DateOnly.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
        {
            return "****-**-**";
        }

        if (lower.Contains("phone", StringComparison.Ordinal) ||
            lower.Contains("mobile", StringComparison.Ordinal) ||
            lower.Contains("landline", StringComparison.Ordinal) ||
            lower.Contains("contactnumber", StringComparison.Ordinal) ||
            lower.Contains("philhealth", StringComparison.Ordinal) ||
            lower.Contains("tin", StringComparison.Ordinal) ||
            lower.Contains("philsys", StringComparison.Ordinal))
        {
            return $"•••••• ({trimmed.Length} chars)";
        }

        if (trimmed.Length <= 1)
        {
            return "*** (1 char)";
        }

        return $"{trimmed[0]}*** ({trimmed.Length} chars)";
    }

    private static string MaskJsonSummary(string trimmed)
    {
        try
        {
            using var doc = JsonDocument.Parse(trimmed);
            if (doc.RootElement.ValueKind == JsonValueKind.Object)
            {
                var count = doc.RootElement.EnumerateObject().Count();
                return count == 1 ? "[Structured JSON · 1 key]" : $"[Structured JSON · {count} keys]";
            }
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                var count = doc.RootElement.GetArrayLength();
                return count == 1 ? "[Structured JSON · 1 item]" : $"[Structured JSON · {count} items]";
            }
        }
        catch (JsonException)
        {
            // Fall through to generic redacted summary
        }
        return $"[Structured JSON · {trimmed.Length} chars]";
    }

    private static Dictionary<string, string?> ParseFlatJsonObject(string? rawJson)
    {
        var map = new Dictionary<string, string?>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(rawJson))
        {
            return map;
        }

        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return map;
            }

            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                map[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.Null or JsonValueKind.Undefined => null,
                    JsonValueKind.String => prop.Value.GetString(),
                    _ => prop.Value.GetRawText()
                };
            }
        }
        catch (JsonException)
        {
            // Ignore malformed JSON
        }

        return map;
    }

    public static string FormatFieldLabel(string fieldName)
    {
        if (string.IsNullOrWhiteSpace(fieldName))
        {
            return fieldName;
        }

        var normalized = fieldName.Replace('_', ' ');
        var sb = new StringBuilder(normalized.Length + 8);
        for (var i = 0; i < normalized.Length; i++)
        {
            var ch = normalized[i];
            if (i > 0 && char.IsUpper(ch) && char.IsLower(normalized[i - 1]))
            {
                sb.Append(' ');
            }
            sb.Append(i == 0 || normalized[i - 1] == ' ' ? char.ToUpperInvariant(ch) : ch);
        }
        return sb.ToString();
    }
}
