using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Application.Common.Privacy;

namespace ClinicEz.Clinic.Infrastructure.Privacy;

/// <summary>
/// High-performance, thread-safe PHI redaction engine implementing strict compliance with
/// the Philippine Data Privacy Act of 2012 (RA 10173) and HIPAA privacy rules.
/// </summary>
public sealed class PhiRedactionService : IPhiRedactionService
{
    public const string ClinicalRedactedToken = "[Clinical Text Redacted - DPA RA 10173]";
    public const string SecretRedactedToken = "[REDACTED_SECRET]";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = false
    };

    // ── Pre-compiled Regular Expressions for Fallback and Sensitive Scanning ─────
    private static readonly Regex SecretKeysRegex = new(
        @"""(?i)(password|passwd|pwd|passwordhash|password_hash|newpassword|oldpassword|pin|clientpin|staffpin|authpin|pincode|token|refreshtoken|refresh_token|accesstoken|access_token|licensetoken|license_token|idtoken|id_token|secret|clientsecret|client_secret|mastersecret|master_secret|sharedsecret|shared_secret|key|aeskey|aes_key|privatekey|private_key|wrappedkeyjson|wrapped_key_json|signingkey|signing_key|authorization|authheader|bearer|apikey|api_key)""\s*:\s*""(?:[^""\\]|\\.)*""",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex MedicalProseKeysRegex = new(
        @"""(?i)(subjective|objective|assessment|plan|homeinstructions|rxnotes|rx_notes|chiefcomplaint|chief_complaint|triagenotes|triage_notes|notes|clinicalnotes|clinical_notes|diagnosisnotes|diagnosis_notes|findings|remarks|generalsurveyremarks|adversereactionremarks|pathologistremarks|skinremarks|heentremarks|chestremarks|heartremarks|abdomenremarks|neuroremarks|rectalremarks|guremarks|gensurveyremarks|philhealthothercomplaint|philhealthpainsite|personalmedicalhistorynotes|familymedicalhistorynotes|reactionmanifestation|specificdescription|complications|clinicalinterpretation|clinicalsummary|reasonforreferral|recommendations|substanceusehistory|substance_use_history|drugtypes|drug_types|pathologyremarks|procedurenotes)""\s*:\s*""(?:[^""\\]|\\.)*""",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex BearerTokenPattern = new(
        @"\bBearer\s+[a-zA-Z0-9_\-\.]+\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex JwtTokenPattern = new(
        @"\beyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\b",
        RegexOptions.Compiled);

    // ── Key Categories (O(1) HashSets with OrdinalIgnoreCase) ─────────────────
    private static readonly HashSet<string> SecretKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "passwd", "pwd", "passwordhash", "password_hash", "newpassword", "oldpassword",
        "pin", "clientpin", "staffpin", "authpin", "pincode",
        "token", "refreshtoken", "refresh_token", "accesstoken", "access_token", "licensetoken", "license_token", "idtoken", "id_token",
        "secret", "clientsecret", "client_secret", "mastersecret", "master_secret", "sharedsecret", "shared_secret",
        "key", "aeskey", "aes_key", "privatekey", "private_key", "wrappedkeyjson", "wrapped_key_json", "signingkey", "signing_key",
        "authorization", "authheader", "bearer", "apikey", "api_key"
    };

    private static readonly HashSet<string> MedicalNarrativeKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "subjective", "objective", "assessment", "plan",
        "homeinstructions", "rxnotes", "rx_notes", "chiefcomplaint", "chief_complaint", "triagenotes", "triage_notes",
        "notes", "clinicalnotes", "clinical_notes", "diagnosisnotes", "diagnosis_notes",
        "findings", "remarks", "generalsurveyremarks", "adversereactionremarks", "pathologistremarks",
        "skinremarks", "heentremarks", "chestremarks", "heartremarks", "abdomenremarks", "neuroremarks", "rectalremarks", "guremarks", "gensurveyremarks",
        "philhealthothercomplaint", "philhealthpainsite",
        "personalmedicalhistorynotes", "familymedicalhistorynotes",
        "reactionmanifestation", "specificdescription", "complications", "clinicalinterpretation",
        "clinicalsummary", "reasonforreferral", "recommendations",
        "substanceusehistory", "substance_use_history", "drugtypes", "drug_types",
        "pathologyremarks", "procedurenotes"
    };

    private static readonly HashSet<string> PatientIdentityKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "patientname", "patient_name", "fullname", "full_name",
        "philhealthpin", "philhealth_pin", "phicpin", "phic_pin",
        "contactnumber", "contact_number", "phonenumber", "phone_number", "phone",
        "patientemail", "patient_email", "email"
    };

    // ── 1. Patient Name Masking ───────────────────────────────────────────────
    public string MaskPatientName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return string.Empty;

        var trimmed = name.Trim();

        // Handle "LastName, FirstName" format
        if (trimmed.Contains(','))
        {
            var parts = trimmed.Split(',', 2, StringSplitOptions.TrimEntries);
            var maskedLast = MaskNameSegment(parts[0]);
            var maskedFirst = parts.Length > 1 ? MaskNameSegment(parts[1]) : string.Empty;

            if (string.IsNullOrEmpty(maskedFirst))
                return maskedLast;

            return $"{maskedLast}, {maskedFirst}";
        }

        return MaskNameSegment(trimmed);
    }

    private static string MaskNameSegment(string segment)
    {
        if (string.IsNullOrWhiteSpace(segment))
            return string.Empty;

        var tokens = segment.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length == 0)
            return string.Empty;

        var maskedTokens = new string[tokens.Length];
        for (var i = 0; i < tokens.Length; i++)
        {
            var token = tokens[i];
            if (token.Contains('-'))
            {
                var subParts = token.Split('-', StringSplitOptions.RemoveEmptyEntries);
                var maskedSubParts = subParts.Select(MaskSingleWord);
                maskedTokens[i] = string.Join("-", maskedSubParts);
            }
            else
            {
                maskedTokens[i] = MaskSingleWord(token);
            }
        }

        return string.Join(" ", maskedTokens);
    }

    private static string MaskSingleWord(string word)
    {
        if (string.IsNullOrWhiteSpace(word))
            return string.Empty;

        var firstLetterIdx = -1;
        for (var j = 0; j < word.Length; j++)
        {
            if (char.IsLetter(word[j]))
            {
                firstLetterIdx = j;
                break;
            }
        }

        if (firstLetterIdx >= 0)
        {
            return $"{char.ToUpperInvariant(word[firstLetterIdx])}***";
        }

        return word.Length > 0 ? $"{char.ToUpperInvariant(word[0])}***" : "***";
    }

    // ── 2. PhilHealth PIN Masking ─────────────────────────────────────────────
    public string MaskPhilHealthPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin))
            return string.Empty;

        var trimmed = pin.Trim();

        // Idempotency: preserve if already masked
        if (trimmed.Contains("****"))
            return trimmed;

        var digits = new string(trimmed.Where(char.IsDigit).ToArray());
        if (digits.Length == 0)
            return string.Empty;

        // Standard 12-digit PhilHealth PIN: XX-XXXXXXXXX-X
        if (digits.Length == 12)
        {
            var prefix = digits[0..2];
            var last4Middle = digits[7..11];
            var checkDigit = digits[11];
            return $"{prefix}-****{last4Middle}-{checkDigit}";
        }

        // Variable length / legacy formats (8 to 11 digits)
        if (digits.Length >= 8)
        {
            var prefix = digits[0..2];
            var checkDigit = digits[^1];
            var middleLength = digits.Length - 3;
            if (middleLength <= 4)
            {
                return $"{prefix}-****-{checkDigit}";
            }

            var last4 = digits[^5..^1];
            return $"{prefix}-****{last4}-{checkDigit}";
        }

        // Short fallback
        if (digits.Length <= 4)
            return "****";

        return $"{digits[..2]}****{digits[^1]}";
    }

    // ── 3. Phone & Email Masking ──────────────────────────────────────────────
    public string MaskPhoneNumber(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
            return string.Empty;

        var trimmed = phone.Trim();
        if (trimmed.Contains("****"))
            return trimmed;

        if (trimmed.StartsWith("+63"))
        {
            var digits = new string(trimmed[3..].Where(char.IsDigit).ToArray());
            if (digits.Length >= 10)
            {
                var prefix = digits[0..3];
                var suffix = digits[^3..];
                return $"+63{prefix}****{suffix}";
            }
        }

        var cleanDigits = new string(trimmed.Where(char.IsDigit).ToArray());
        if (cleanDigits.Length == 0)
            return string.Empty;

        if (cleanDigits.Length == 11 && cleanDigits.StartsWith("09"))
        {
            return $"{cleanDigits[0..4]}****{cleanDigits[^3..]}";
        }

        if (cleanDigits.Length == 10)
        {
            if (cleanDigits.StartsWith("02"))
            {
                return $"02****{cleanDigits[^2..]}";
            }
            return $"{cleanDigits[0..3]}****{cleanDigits[^3..]}";
        }

        if (cleanDigits.Length >= 7)
        {
            return $"{cleanDigits[0..2]}****{cleanDigits[^2..]}";
        }

        return "****";
    }

    public string MaskEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return string.Empty;

        var trimmed = email.Trim();
        if (trimmed.Contains("***@"))
            return trimmed;

        var atIndex = trimmed.IndexOf('@');
        if (atIndex <= 0 || atIndex == trimmed.Length - 1)
            return "****";

        var local = trimmed[..atIndex];
        var domain = trimmed[(atIndex + 1)..];

        if (local.Length <= 2)
        {
            return $"{local[0]}***@{domain}";
        }

        return $"{local[0]}***{local[^1]}@{domain}";
    }

    // ── 4. Cryptographic Text Checksum (SHA-256) ─────────────────────────────
    public string ComputeTextChecksum(string? text)
    {
        if (string.IsNullOrEmpty(text))
            return string.Empty;

        var bytes = Encoding.UTF8.GetBytes(text);
        var hashBytes = SHA256.HashData(bytes);
        return $"sha256:{Convert.ToHexStringLower(hashBytes)}";
    }

    // ── 5. Payload JSON Redaction Engine ─────────────────────────────────────
    public string RedactPayloadJson(string? rawJson)
    {
        if (string.IsNullOrWhiteSpace(rawJson))
            return "{}";

        try
        {
            var node = JsonNode.Parse(rawJson);
            if (node == null)
                return "{}";

            RedactNode(node);
            return node.ToJsonString(JsonOptions);
        }
        catch (JsonException)
        {
            // Fallback for malformed JSON or plain text
            return FallbackRegexRedaction(rawJson);
        }
    }

    private void RedactNode(JsonNode node)
    {
        if (node is JsonObject obj)
        {
            var keys = obj.Select(kv => kv.Key).ToList();
            var checksumsToAdd = new List<(string Key, string Checksum)>();

            foreach (var key in keys)
            {
                var value = obj[key];

                // 1. Secrets: unconditional redaction
                if (SecretKeys.Contains(key))
                {
                    obj[key] = JsonValue.Create(SecretRedactedToken);
                    continue;
                }

                // 2. Patient Identity Keys: deterministic privacy masking
                if (PatientIdentityKeys.Contains(key) && value is JsonValue jsonVal && jsonVal.TryGetValue<string>(out var strId))
                {
                    if (key.Contains("pin", StringComparison.OrdinalIgnoreCase))
                    {
                        obj[key] = JsonValue.Create(MaskPhilHealthPin(strId));
                    }
                    else if (key.Contains("email", StringComparison.OrdinalIgnoreCase))
                    {
                        obj[key] = JsonValue.Create(MaskEmail(strId));
                    }
                    else if (key.Contains("phone", StringComparison.OrdinalIgnoreCase) || key.Contains("contact", StringComparison.OrdinalIgnoreCase))
                    {
                        obj[key] = JsonValue.Create(MaskPhoneNumber(strId));
                    }
                    else
                    {
                        obj[key] = JsonValue.Create(MaskPatientName(strId));
                    }
                    continue;
                }

                // 3. Medical Narrative Keys: prose redaction & SHA-256 checksumming
                if (MedicalNarrativeKeys.Contains(key))
                {
                    if (value is JsonValue strVal && strVal.TryGetValue<string>(out var text))
                    {
                        var checksum = ComputeTextChecksum(text);
                        obj[key] = JsonValue.Create(ClinicalRedactedToken);
                        if (!string.IsNullOrEmpty(checksum))
                        {
                            checksumsToAdd.Add(($"{key}Checksum", checksum));
                        }
                    }
                    else if (value is JsonObject diffObj)
                    {
                        // Handle change diff structures: { "old": "...", "new": "..." }
                        if (diffObj.ContainsKey("old") && diffObj["old"] is JsonValue oldVal && oldVal.TryGetValue<string>(out var oldText))
                        {
                            diffObj["oldChecksum"] = JsonValue.Create(ComputeTextChecksum(oldText));
                            diffObj["old"] = JsonValue.Create(ClinicalRedactedToken);
                        }
                        if (diffObj.ContainsKey("new") && diffObj["new"] is JsonValue newVal && newVal.TryGetValue<string>(out var newText))
                        {
                            diffObj["newChecksum"] = JsonValue.Create(ComputeTextChecksum(newText));
                            diffObj["new"] = JsonValue.Create(ClinicalRedactedToken);
                        }
                    }
                    continue;
                }

                // 4. Nested embedded JSON strings (e.g. PhysicalExamFindingsJson)
                if (value is JsonValue potentialJson && potentialJson.TryGetValue<string>(out var rawInner) &&
                    !string.IsNullOrWhiteSpace(rawInner) &&
                    (rawInner.StartsWith('{') || rawInner.StartsWith('[')))
                {
                    try
                    {
                        var innerNode = JsonNode.Parse(rawInner);
                        if (innerNode != null)
                        {
                            RedactNode(innerNode);
                            obj[key] = JsonValue.Create(innerNode.ToJsonString(JsonOptions));
                            continue;
                        }
                    }
                    catch (JsonException)
                    {
                        // Not valid inner JSON; proceed to standard processing
                    }
                }

                // 5. Value scanning for unstructured text
                if (value is JsonValue leafVal && leafVal.TryGetValue<string>(out var leafText))
                {
                    if (BearerTokenPattern.IsMatch(leafText) || JwtTokenPattern.IsMatch(leafText))
                    {
                        obj[key] = JsonValue.Create(SecretRedactedToken);
                    }
                }

                // 6. Recursively process child objects or arrays
                if (value is JsonObject or JsonArray)
                {
                    RedactNode(value);
                }
            }

            foreach (var (chkKey, chkVal) in checksumsToAdd)
            {
                obj[chkKey] = JsonValue.Create(chkVal);
            }
        }
        else if (node is JsonArray arr)
        {
            foreach (var item in arr)
            {
                if (item != null)
                {
                    RedactNode(item);
                }
            }
        }
    }

    private static string FallbackRegexRedaction(string input)
    {
        var redacted = SecretKeysRegex.Replace(input, match =>
        {
            var colonIdx = match.Value.IndexOf(':');
            var keyPart = match.Value[..colonIdx];
            return $"{keyPart}: \"{SecretRedactedToken}\"";
        });

        redacted = MedicalProseKeysRegex.Replace(redacted, match =>
        {
            var colonIdx = match.Value.IndexOf(':');
            var keyPart = match.Value[..colonIdx];
            return $"{keyPart}: \"{ClinicalRedactedToken}\"";
        });

        redacted = BearerTokenPattern.Replace(redacted, "Bearer " + SecretRedactedToken);
        redacted = JwtTokenPattern.Replace(redacted, SecretRedactedToken);

        return redacted;
    }
}
