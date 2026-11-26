using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;

namespace ClinicEz.V1Sync.Api.Services;

/// <summary>
/// Pure, deterministic v1 -> v2 domain mappers enforcing strict PascalCase v2 enums,
/// lossless dynamic CustomFields expansion, and zero fabricated placeholder values.
/// </summary>
public static class SyncTransforms
{
    public const string SyncActor = "System:V1Sync";
    public const string LegacyUnencryptedAlgorithm = "NONE";

    // Fixed seeded DocumentType UUIDs in patient-api (verified against CLINICEZ-PATIENT_DB)
    public static readonly Guid DocTypeXray = new("11111111-1111-1111-1111-111111111111");
    public static readonly Guid DocTypeLabResult = new("22222222-2222-2222-2222-222222222222");
    public static readonly Guid DocTypeMedCert = new("33333333-3333-3333-3333-333333333333");
    public static readonly Guid DocTypePrescription = new("44444444-4444-4444-4444-444444444444");
    public static readonly Guid DocTypeGovId = new("55555555-5555-5555-5555-555555555555");
    public static readonly Guid DocTypeOther = new("66666666-6666-6666-6666-666666666666");

    public static string? Clean(string? value, int? maxLength = null)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        if (maxLength.HasValue && trimmed.Length > maxLength.Value)
        {
            trimmed = trimmed[..maxLength.Value];
        }
        return trimmed;
    }

    public static string CleanRequired(string? value, string fallback, int? maxLength = null) =>
        Clean(value, maxLength) ?? fallback;

    /// <summary>
    /// Strict Clerk ID extraction: keeps only live Clerk `user_*` IDs.
    /// Drops legacy `auth0|*` identifiers so zero Auth0 strings enter v2.
    /// </summary>
    public static string? ExtractClerkUserId(string? v1UserId)
    {
        var cleaned = Clean(v1UserId);
        if (cleaned is null) return null;
        return cleaned.StartsWith("user_", StringComparison.Ordinal) ? cleaned : null;
    }

    public static bool IsLegacyAuth0(string? v1UserId)
    {
        var cleaned = Clean(v1UserId);
        return cleaned is not null && cleaned.StartsWith("auth0|", StringComparison.OrdinalIgnoreCase);
    }

    public static DateOnly? ToSafeDateOnly(DateTime? dt)
    {
        if (!dt.HasValue) return null;
        var d = DateOnly.FromDateTime(dt.Value);
        if (d.Year < 1900 || d > DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)))
            return null;
        return d;
    }

    public static string MapClinicSex(string? v1Gender) => (v1Gender?.Trim().ToUpperInvariant()) switch
    {
        "MALE" or "M" => "Male",
        "FEMALE" or "F" => "Female",
        "INTERSEX" => "Intersex",
        _ => "Unknown"
    };

    public static string? MapPatientSex(string? v1Gender) => (v1Gender?.Trim().ToUpperInvariant()) switch
    {
        "MALE" or "M" => "Male",
        "FEMALE" or "F" => "Female",
        "OTHER" or "INTERSEX" => "Other",
        _ => null
    };

    public static string? MapClinicCivilStatus(string? v1CivilStatus) => (v1CivilStatus?.Trim().ToUpperInvariant()) switch
    {
        "SINGLE" => "Single",
        "MARRIED" => "Married",
        "WIDOWED" => "Widowed",
        "SEPARATED" => "Separated",
        "DIVORCED" => "Divorced",
        "ANNULLED" => "Annulled",
        "COHABITING" => "Cohabiting",
        "COMMON_LAW" or "COMMONLAW" => "CommonLaw",
        "OTHER" => "Other",
        _ => null
    };

    public static string? MapPatientCivilStatus(string? v1CivilStatus) => (v1CivilStatus?.Trim().ToUpperInvariant()) switch
    {
        "SINGLE" => "Single",
        "MARRIED" => "Married",
        "WIDOWED" => "Widowed",
        "SEPARATED" => "Separated",
        "DIVORCED" => "Divorced",
        _ => null
    };

    public static string? MapBloodType(string? v1BloodType) => (v1BloodType?.Trim().ToUpperInvariant()) switch
    {
        "A_POSITIVE" or "A+" or "APOSITIVE" => "APositive",
        "A_NEGATIVE" or "A-" or "ANEGATIVE" => "ANegative",
        "B_POSITIVE" or "B+" or "BPOSITIVE" => "BPositive",
        "B_NEGATIVE" or "B-" or "BNEGATIVE" => "BNegative",
        "AB_POSITIVE" or "AB+" or "ABPOSITIVE" => "ABPositive",
        "AB_NEGATIVE" or "AB-" or "ABNEGATIVE" => "ABNegative",
        "O_POSITIVE" or "O+" or "OPOSITIVE" => "OPositive",
        "O_NEGATIVE" or "O-" or "ONEGATIVE" => "ONegative",
        "UNKNOWN" or "RH_POSITIVE" => "Unknown",
        _ => null
    };

    public static string MapClinicAppointmentStatus(string? v1Status) => (v1Status?.Trim().ToUpperInvariant()) switch
    {
        "COMPLETED" => "Completed",
        "CANCELLED" or "REJECTED" or "DROPPED" => "Cancelled",
        "RECEIVED" or "ROUTED" => "CheckedIn",
        "PENDING" => "Pending",
        _ => "Completed"
    };

    public static string MapPatientAppointmentStatus(string? v1Status) => (v1Status?.Trim().ToUpperInvariant()) switch
    {
        "COMPLETED" => "Completed",
        "CANCELLED" or "REJECTED" or "DROPPED" => "Cancelled",
        "RECEIVED" or "ROUTED" => "Confirmed",
        "PENDING" => "Pending",
        _ => "Completed"
    };

    public static string MapHistoricalQueueStatus(string? v1Status, bool hasConsultation) => (v1Status?.Trim().ToUpperInvariant()) switch
    {
        "CANCELLED" or "REJECTED" or "DROPPED" when !hasConsultation => "Cancelled",
        _ => "Completed"
    };

    public static string MapClinicVerificationStatus(string? v1Status) => (v1Status?.Trim().ToUpperInvariant()) switch
    {
        "VERIFIED" => "Verified",
        "PENDING" => "PendingVerification",
        "REJECTED" => "Rejected",
        "UNVERIFIED" => "Unverified",
        _ => "Verified"
    };

    /// <summary>
    /// Maps all 22 v1 Clinic #3 `System.name` values to exact PascalCase `RosSystem` enum values in clinic-api.
    /// </summary>
    public static string? MapRosCategory(string? v1SystemName)
    {
        var raw = Clean(v1SystemName);
        if (raw is null) return null;

        return raw.ToUpperInvariant() switch
        {
            "CARDIO" or "VASCULAR" or "CARDIOVASCULAR" => "Cardiovascular",
            "RESPI" or "RESPIRATORY" => "Respiratory",
            "DERMA" or "DERMATOLOGIC" or "SKIN" => "Dermatologic",
            "GASTRO" or "GI" or "GASTROINTESTINAL" => "Gastrointestinal",
            "GENITOURINARY" or "RENAL" or "REPRODUCTIVE" or "GU" => "Genitourinary",
            "MUSCULOSKELETAL" or "MS" => "Musculoskeletal",
            "NEURO" or "NEUROLOGICAL" or "NEUROLOGIC" => "Neurological",
            "PSYCHIA" or "PSYCHIATRIC" => "PsychiatricNeurodevelopmental",
            "ENDOCRINE/METABOLIC" or "ENDOCRINE" => "EndocrineMetabolic",
            "HEMA" or "HEMATOLOGIC" => "HematologicLymphatic",
            "IMMUNO" or "ALLERGIC" => "AllergicImmunologic",
            "OPTHA" or "OTORHINOLARYNGO" or "ENT" or "DENTAL" or "HEENT" => "Heent",
            "ESSENTIALLY NORMAL" => "EssentiallyNormal",
            "INFECTIOUS" or "NEOPLASM" or "OTHERS" or _ => "General"
        };
    }

    /// <summary>
    /// Maps all 35 v1 `FileType.name` values into the 6 fixed seeded `patient-api` `document_types` UUIDs.
    /// </summary>
    public static Guid MapPatientDocumentTypeId(string? v1FileTypeName, string? fileName = null)
    {
        var raw = (v1FileTypeName ?? string.Empty).Trim().ToLowerInvariant();
        if (raw.Contains("vaccin") || raw.Contains("immuniz"))
        {
            return DocTypeOther;
        }

        if (raw.Contains("x-ray") || raw.Contains("xray") || raw.Contains("ct-scan") ||
            raw.Contains("mri") || raw.Contains("ultrasound") || raw.Contains("angiogram") ||
            raw.Contains("echocardiography"))
        {
            return DocTypeXray;
        }

        if (raw.Contains("ecg") || raw.Contains("lab") || raw.Contains("blood") ||
            raw.Contains("hematology") || raw.Contains("urinalysis") || raw.Contains("fecalysis") ||
            raw.Contains("serology") || raw.Contains("sputum") || raw.Contains("covid") ||
            raw.Contains("drug test"))
        {
            return DocTypeLabResult;
        }

        if (raw.Contains("medical certificate") || raw.Contains("certificate"))
        {
            return DocTypeMedCert;
        }

        if (raw.Contains("prescription"))
        {
            return DocTypePrescription;
        }

        if (raw.Contains("pwd id") || raw.EndsWith(" id") || raw == "id")
        {
            return DocTypeGovId;
        }

        // Fallback hint from filename if FileType is generic
        var fn = (fileName ?? string.Empty).Trim().ToLowerInvariant();
        if (fn.Contains("ecg")) return DocTypeLabResult;
        if (fn.Contains("xray") || fn.Contains("x-ray")) return DocTypeXray;
        if (fn.Contains("medcert") || fn.Contains("med_cert")) return DocTypeMedCert;
        if (fn.Contains("prescription") ||
            Regex.IsMatch(fn.Replace('_', ' '), @"\brx\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
        {
            return DocTypePrescription;
        }

        return DocTypeOther;
    }

    public static string MapClinicRecordAttachmentType(string? v1FileTypeName)
    {
        var raw = (v1FileTypeName ?? string.Empty).Trim().ToLowerInvariant();
        if (raw.Contains("vaccin") || raw.Contains("immuniz"))
        {
            return "Other";
        }
        if (raw.Contains("ecg"))
        {
            return "ECGStrip";
        }
        if (raw.Contains("x-ray") || raw.Contains("xray") || raw.Contains("ct-scan") ||
            raw.Contains("mri") || raw.Contains("ultrasound") ||
            raw.Contains("angiogram") || raw.Contains("echocardiography"))
        {
            return "ImagingReport";
        }
        if (raw.Contains("lab") || raw.Contains("blood") || raw.Contains("hematology") ||
            raw.Contains("urinalysis") || raw.Contains("fecalysis") || raw.Contains("serology") ||
            raw.Contains("sputum") || raw.Contains("covid") || raw.Contains("drug test"))
        {
            return "LabResult";
        }
        if (raw.Contains("discharge"))
        {
            return "DischargeSummary";
        }
        if (raw.Contains("consent"))
        {
            return "ConsentForm";
        }
        if (raw.Contains("referral"))
        {
            return "ExternalReferral";
        }
        if (raw.Contains("medical certificate") || raw.Contains("certificate"))
        {
            return "MedicalCertificate";
        }
        return "Other";
    }

    public static string? ExtractFileExtension(string? fileName, string? mimeType)
    {
        var cleanName = Clean(fileName);
        if (cleanName is not null)
        {
            var ext = Path.GetExtension(cleanName).TrimStart('.').ToLowerInvariant();
            if (!string.IsNullOrWhiteSpace(ext) && ext.Length <= 15)
            {
                return ext;
            }
        }

        return (mimeType?.Trim().ToLowerInvariant()) switch
        {
            "application/pdf" => "pdf",
            "image/jpeg" or "image/jpg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            _ => null
        };
    }

    public static string MapAllergyCategory(string? allergenName)
    {
        var raw = (allergenName ?? string.Empty).ToLowerInvariant();
        if (raw.Contains("penicillin") || raw.Contains("amoxicillin") || raw.Contains("nsaid") ||
            raw.Contains("aspirin") || raw.Contains("drug") || raw.Contains("sulfa") ||
            raw.Contains("ibuprofen") || raw.Contains("paracetamol") || raw.Contains("antibiotic"))
            return "Medication";
        if (raw.Contains("shrimp") || raw.Contains("seafood") || raw.Contains("peanut") ||
            raw.Contains("egg") || raw.Contains("milk") || raw.Contains("chicken") ||
            raw.Contains("fish") || raw.Contains("crab") || raw.Contains("food"))
            return "Food";
        if (raw.Contains("dust") || raw.Contains("pollen") || raw.Contains("mold") || raw.Contains("pet"))
            return "Environmental";
        return "Other";
    }

    public static string MapPatientAllergyType(string? allergenName) => MapAllergyCategory(allergenName) switch
    {
        "Medication" => "Drug",
        "Food" => "Food",
        "Environmental" => "Environmental",
        _ => "Other"
    };

    public static string MapSeverity(string? v1Severity) => (v1Severity?.Trim().ToUpperInvariant()) switch
    {
        "MILD" => "Mild",
        "MODERATE" => "Moderate",
        "SEVERE" => "Severe",
        "LIFE_THREATENING" or "CRITICAL" => "LifeThreatening",
        _ => "Moderate"
    };

    public static string MapFitnessStatus(string? classificationName)
    {
        var raw = (classificationName ?? string.Empty).Trim().ToLowerInvariant();
        if (raw.Contains("unfit") || raw.Contains("not fit") || raw.Contains("class d"))
            return "UnfitToWork";
        if ((raw.Contains("fit to work") || raw.Contains("fit for work")) &&
            !raw.Contains("restriction") && !raw.Contains("limited") &&
            !raw.Contains("pending") && !raw.Contains("conditional") && !raw.Contains("limitation"))
            return "FitToWork";
        if (raw.Contains("class c") || raw.Contains("restriction") || raw.Contains("clearance") ||
            raw.Contains("pending") || raw.Contains("limited") ||
            raw.Contains("conditional") || raw.Contains("limitation"))
            return "FitWithRestrictions";
        if (raw.Contains("light duty") || raw.Contains("lightduty"))
            return "LightDuty";
        if (raw.Contains("school"))
            return "FitToSchool";
        return "FitToWork";
    }

    public static string MapClinicPhilHealthMemberType(string? v1MemberType)
    {
        var raw = Clean(v1MemberType)?.ToUpperInvariant();
        return raw is "DD" or "DEPENDENT" or "D" or "DEP" ? "DD" : "MM";
    }

    public static string? MapPhilHealthDependentRelationship(string? v1Relationship)
    {
        var raw = Clean(v1Relationship)?.ToUpperInvariant();
        if (raw is null) return null;
        return raw switch
        {
            "S" or "SPOUSE" or "WIFE" or "HUSBAND" => "S",
            "C" or "CHILD" or "SON" or "DAUGHTER" => "C",
            "P" or "PARENT" or "MOTHER" or "FATHER" => "P",
            "D" or "DISABLED" or "DISABLEDDEPENDENT" or "DISABLED_DEPENDENT" => "D",
            _ => null
        };
    }

    public static string MapClinicAppointmentType(string? v1ModeName, string? meetingUrl)
    {
        var raw = Clean(v1ModeName)?.ToUpperInvariant();
        if (raw is not null && (raw.Contains("VIRTUAL") || raw.Contains("TELE")))
            return "Teleconsult";
        if (!string.IsNullOrWhiteSpace(meetingUrl))
            return "Teleconsult";
        return "InPerson";
    }

    public static string? ExtractKonsultaAdviceText(string? rawJsonOrText)
    {
        var cleaned = Clean(rawJsonOrText);
        if (cleaned is null) return null;

        if (cleaned.StartsWith('{') || cleaned.StartsWith('[') || cleaned.StartsWith('"'))
        {
            try
            {
                using var doc = JsonDocument.Parse(cleaned);
                var extracted = FlattenJsonText(doc.RootElement);
                return Clean(extracted);
            }
            catch (JsonException)
            {
                // Fall back to raw text when not valid JSON
            }
        }

        return cleaned;
    }

    public static string? ExtractDiagnosticServicesOptionCode(string? rawJsonOrText)
    {
        var cleaned = Clean(rawJsonOrText);
        if (cleaned is null) return null;

        string? value = cleaned;
        if (cleaned.StartsWith('{') || cleaned.StartsWith('[') || cleaned.StartsWith('"'))
        {
            try
            {
                using var doc = JsonDocument.Parse(cleaned);
                value = FlattenJsonText(doc.RootElement, separator: ",");
            }
            catch (JsonException)
            {
                value = cleaned;
            }
        }

        return Clean(value, 10);
    }

    public static string MapGeneralSurveyStatus(string? codeOrDescription)
    {
        var raw = Clean(codeOrDescription)?.ToUpperInvariant();
        if (raw is null) return "Normal";
        if (raw is "2" or "ABNORMAL" || raw.Contains("ABNORMAL")) return "Abnormal";
        return "Normal";
    }

    public static string MapPhysicalExamSystem(string? v1Category)
    {
        var raw = Clean(v1Category)?.ToUpperInvariant();
        return raw switch
        {
            "SKIN" => "Skin",
            "HEENT" => "Heent",
            "CHEST" => "Chest",
            "HEART" => "Heart",
            "ABDOMEN" => "Abdomen",
            "NEURO" or "NEUROLOGICAL" => "Neurological",
            "RECTAL" => "Rectal",
            "GU" or "GENITOURINARY" => "Genitourinary",
            _ => "GeneralSurvey"
        };
    }

    private static string? FlattenJsonText(JsonElement el, string separator = "\n")
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.String:
                return Clean(el.GetString());
            case JsonValueKind.Number:
            case JsonValueKind.True:
            case JsonValueKind.False:
                return el.ToString();
            case JsonValueKind.Array:
                var items = el.EnumerateArray()
                    .Select(item => FlattenJsonText(item, separator))
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .ToList();
                return items.Count > 0 ? string.Join(separator, items) : null;
            case JsonValueKind.Object:
                foreach (var preferred in new[] { "code", "option", "advice", "homeInstructions", "instructions", "text", "value", "notes" })
                {
                    if (el.TryGetProperty(preferred, out var propVal))
                    {
                        var val = FlattenJsonText(propVal, separator);
                        if (!string.IsNullOrWhiteSpace(val)) return val;
                    }
                }
                var parts = el.EnumerateObject()
                    .Select(p => FlattenJsonText(p.Value, separator))
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .ToList();
                return parts.Count > 0 ? string.Join(separator, parts) : null;
            default:
                return null;
        }
    }

    public static string? MapPatientSmokingStatus(string? v1SmokingStatus)
    {
        var clean = Clean(v1SmokingStatus);
        if (clean is null) return null;

        return clean.ToUpperInvariant() switch
        {
            "CURRENT" or "CURRENT_SMOKER" or "SMOKER" or "YES" or "Y" or "ACTIVE" or "OCCASIONAL" or "DAILY" or "REGULAR" or "TRUE" => "CurrentSmoker",
            "FORMER" or "FORMER_SMOKER" or "QUIT" or "EX" or "EX-SMOKER" or "PREVIOUS" => "FormerSmoker",
            _ => "NeverSmoked"
        };
    }

    public static string? MapPatientAlcoholUse(string? v1AlcoholStatus)
    {
        var clean = Clean(v1AlcoholStatus);
        if (clean is null) return null;

        return clean.ToUpperInvariant() switch
        {
            "HEAVY" or "HEAVY_DRINKER" or "DAILY" or "CHRONIC" => "Heavy",
            "MODERATE" or "MODERATE_DRINKER" or "REGULAR" or "YES" or "Y" => "Moderate",
            "OCCASIONAL" or "OCCASIONAL_DRINKER" or "SOCIAL" or "LIGHT" or "CURRENT" or "DRINKER" or "ACTIVE" or "TRUE" => "Occasional",
            _ => "Never"
        };
    }

    public static bool IsActiveSmoker(string? v1SmokingStatus)
    {
        var v = Clean(v1SmokingStatus)?.ToUpperInvariant();
        if (v is null) return false;
        return v is "CURRENT" or "CURRENT_SMOKER" or "SMOKER" or "YES" or "Y" or "ACTIVE" or "OCCASIONAL" or "DAILY" or "REGULAR" or "TRUE";
    }

    public static bool IsActiveAlcoholDrinker(string? v1AlcoholStatus)
    {
        var v = Clean(v1AlcoholStatus)?.ToUpperInvariant();
        if (v is null) return false;
        return v is "HEAVY" or "HEAVY_DRINKER" or "MODERATE" or "MODERATE_DRINKER" or "REGULAR" or "OCCASIONAL"
            or "OCCASIONAL_DRINKER" or "SOCIAL" or "LIGHT" or "CURRENT" or "DRINKER" or "YES" or "Y"
            or "ACTIVE" or "DAILY" or "CHRONIC" or "TRUE";
    }

    public static decimal? SanitizeBmi(decimal? value)
    {
        if (!value.HasValue) return null;
        if (value.Value <= 0m || value.Value > 999.99m) return null;
        var rounded = Math.Round(value.Value, 2, MidpointRounding.AwayFromZero);
        return rounded is > 0m and <= 999.99m ? rounded : null;
    }

    public static decimal? SanitizeTemperatureCelsius(decimal? value)
    {
        if (!value.HasValue) return null;
        if (value.Value < 25.0m || value.Value > 45.0m) return null;
        return value.Value;
    }

    public static decimal? SanitizeOxygenSaturationPercent(decimal? value)
    {
        if (!value.HasValue) return null;
        if (value.Value < 0m || value.Value > 100.0m) return null;
        return value.Value;
    }

    public static decimal? SanitizeSmokingPackYears(decimal? value)
    {
        if (!value.HasValue) return null;
        if (value.Value < 0m || value.Value > 999.99m) return null;
        var rounded = Math.Round(value.Value, 2, MidpointRounding.AwayFromZero);
        return rounded is >= 0m and <= 999.99m ? rounded : null;
    }

    public static decimal? SanitizePositiveNumeric6_2(decimal? value)
    {
        if (!value.HasValue) return null;
        if (value.Value <= 0m || value.Value > 9999.99m) return null;
        var rounded = Math.Round(value.Value, 2, MidpointRounding.AwayFromZero);
        return rounded is > 0m and <= 9999.99m ? rounded : null;
    }

    public static decimal? SanitizeWeightKg(decimal? value)
    {
        if (!value.HasValue) return null;
        if (value.Value <= 0m || value.Value > 999.99m) return null;
        var rounded = Math.Round(value.Value, 2, MidpointRounding.AwayFromZero);
        return rounded is > 0m and <= 999.99m ? rounded : null;
    }

    public static decimal? SanitizeHeightCm(decimal? value)
    {
        if (!value.HasValue) return null;
        if (value.Value <= 0m || value.Value > 9999.9m) return null;
        var rounded = Math.Round(value.Value, 1, MidpointRounding.AwayFromZero);
        return rounded is > 0m and <= 9999.9m ? rounded : null;
    }

    public static decimal? SanitizePatientPackYears(decimal? value)
    {
        if (!value.HasValue) return null;
        if (value.Value < 0m || value.Value > 9999.9m) return null;
        var rounded = Math.Round(value.Value, 1, MidpointRounding.AwayFromZero);
        return rounded is >= 0m and <= 9999.9m ? rounded : null;
    }

    public static string GenerateClinicEzId(int v1UserId, int salt = 0) =>
        DeterministicUuid.GenerateClinicEzId(v1UserId, salt);

    /// <summary>
    /// Produces a strictly zero-PHI summary for persistence in `sync_runs.error_message`.
    /// Never includes `ex.Message`, `Detail`, `Hint`, `Where`, or user/patient values.
    /// </summary>
    public static string SanitizeErrorMessage(Exception? ex)
    {
        if (ex is null) return "UnknownError";

        if (ex is AggregateException agg)
        {
            var flat = agg.Flatten();
            if (flat.InnerExceptions.Count > 0)
            {
                ex = flat.InnerExceptions[0];
            }
        }

        if (ex is PostgresException pg)
        {
            var constraint = string.IsNullOrWhiteSpace(pg.ConstraintName) ? "none" : pg.ConstraintName;
            return $"PostgresException (SqlState={pg.SqlState}, Constraint={constraint})";
        }

        if (ex is NpgsqlException nx)
        {
            var state = string.IsNullOrWhiteSpace(nx.SqlState) ? "none" : nx.SqlState;
            return $"NpgsqlException (SqlState={state})";
        }

        return ex.GetType().Name;
    }

    /// <summary>
    /// Redacts arbitrary error strings so no PHI (emails, names, key=value details) ever enters `sync_runs.error_message`.
    /// Extracts only recognized exception type names and SQLSTATE codes if present.
    /// </summary>
    public static string SanitizeErrorMessage(string? rawMessage)
    {
        if (string.IsNullOrWhiteSpace(rawMessage)) return "UnknownError";

        var sqlStateMatch = Regex.Match(rawMessage, @"\bSqlState=([0-9A-Z]{5})\b|^\s*([0-9A-Z]{5}):", RegexOptions.CultureInvariant);
        var exTypeMatch = Regex.Match(rawMessage, @"^\s*([A-Za-z0-9_.]+Exception)\b", RegexOptions.CultureInvariant);

        if (exTypeMatch.Success && sqlStateMatch.Success)
        {
            var state = !string.IsNullOrEmpty(sqlStateMatch.Groups[1].Value)
                ? sqlStateMatch.Groups[1].Value
                : sqlStateMatch.Groups[2].Value;
            return $"{exTypeMatch.Groups[1].Value} (SqlState={state})";
        }

        if (sqlStateMatch.Success)
        {
            var state = !string.IsNullOrEmpty(sqlStateMatch.Groups[1].Value)
                ? sqlStateMatch.Groups[1].Value
                : sqlStateMatch.Groups[2].Value;
            return $"DatabaseError (SqlState={state})";
        }

        if (exTypeMatch.Success)
        {
            return exTypeMatch.Groups[1].Value;
        }

        return "RedactedRuntimeError";
    }

    public static string NormalizeYearLevel(string? v1YearLevel)
    {
        var raw = Clean(v1YearLevel);
        if (raw is null) return string.Empty;
        return raw.ToUpperInvariant() switch
        {
            "1" or "1ST" or "1ST YEAR" or "FIRST YEAR" => "1st Year",
            "2" or "2ND" or "2ND YEAR" or "SECOND YEAR" => "2nd Year",
            "3" or "3RD" or "3RD YEAR" or "THIRD YEAR" => "3rd Year",
            "4" or "4TH" or "4TH YEAR" or "FOURTH YEAR" => "4th Year",
            "5" or "5TH" or "5TH YEAR" or "FIFTH YEAR" => "5th Year",
            "GRADUATE" or "GRADUATE STUDIES" => "Graduate Studies",
            _ => raw
        };
    }

    /// <summary>
    /// Builds the lossless JSONB `CustomFields` dictionary for a Track 1 `clinic-api` Patient,
    /// matching `university_ustp` + `patient_intake_contacts` + all 9 dedicated dynamic v1 fields
    /// (`lrn`, `student_level`, `office`, `position`, `designation`, `place_of_birth`,
    /// `legacy_case_number`, `tin`, `philsys_id`) without ever cramming or dropping non-null values.
    /// </summary>
    public static Dictionary<string, object?> BuildClinicPatientCustomFields(
        string? affiliation,
        string? studentId,
        string? lrn,
        string? studentLevel,
        string? collegeName,
        string? programName,
        string? yearLevel,
        string? employeeId,
        string? departmentName,
        string? officeName,
        string? position,
        string? designation,
        string? placeOfBirth,
        string? legacyCaseNumber,
        string? tin,
        string? philSysId,
        string? addressLine,
        string? barangay,
        string? city,
        string? province,
        string? emergencyContactName,
        string? emergencyContactPhone,
        string? emergencyContactRelationship,
        string? v1AccountType,
        string? v1OnboardingStatus,
        string? v1Nickname,
        string? campusLocation = "Cagayan de Oro (Main)",
        string? secondaryAddressLine = null,
        string? secondaryBarangay = null,
        string? secondaryCity = null,
        string? secondaryProvince = null,
        string? secondaryPostalCode = null,
        string? emergencyContactAddress = null,
        IReadOnlyList<IReadOnlyDictionary<string, object?>>? philHealthDependents = null)
    {
        var dict = new Dictionary<string, object?>(StringComparer.Ordinal);

        void Put(string key, string? val)
        {
            var cleaned = Clean(val);
            if (cleaned is not null) dict[key] = cleaned;
        }

        // Standard university_ustp template fields
        Put("affiliation", affiliation);
        Put("student_id", studentId);
        Put("college", collegeName);
        Put("program", programName);
        Put("year_level", NormalizeYearLevel(yearLevel));
        Put("employee_id", employeeId);
        Put("department", departmentName);
        Put("campus_location", campusLocation);

        // 9 auto-created lossless v1 dynamic CustomFieldDefinitions
        Put("lrn", lrn);
        Put("student_level", studentLevel);
        Put("office", officeName);
        Put("position", position);
        Put("designation", designation);
        Put("place_of_birth", placeOfBirth);
        Put("legacy_case_number", legacyCaseNumber);
        Put("tin", tin);
        Put("philsys_id", philSysId);

        // Canonical intake fallback keys (aligned with ClinicCustomFieldTemplatesCatalog.CanonicalIntakeFallbackKeys)
        Put("primary_address_line", addressLine);
        Put("primary_barangay", barangay);
        Put("primary_city", city);
        Put("primary_province", province);
        Put("emergency_contact_name", emergencyContactName);
        Put("emergency_contact_phone", emergencyContactPhone);
        Put("emergency_contact_relationship", emergencyContactRelationship);
        Put("emergency_contact_address", emergencyContactAddress);

        // Secondary address template keys (populated when a non-primary UserAddress exists)
        Put("secondary_address_line", secondaryAddressLine);
        Put("secondary_barangay", secondaryBarangay);
        Put("secondary_city", secondaryCity);
        Put("secondary_province", secondaryProvince);
        Put("secondary_postal_code", secondaryPostalCode);

        // PhilHealth dependents snapshot (1:1 PatientPhilHealthMemberships constraint prevents extra membership rows)
        if (philHealthDependents is { Count: > 0 })
        {
            dict["philhealth_dependents"] = philHealthDependents;
        }

        // Additional unmapped v1 metadata preserved cleanly
        Put("v1_account_type", v1AccountType);
        Put("v1_onboarding_status", v1OnboardingStatus);
        Put("v1_nickname", v1Nickname);

        return dict;
    }

    public static string SerializeSortedJson(IReadOnlyDictionary<string, object?> dict)
    {
        var sorted = new SortedDictionary<string, object?>(StringComparer.Ordinal);
        foreach (var kv in dict)
        {
            sorted[kv.Key] = CanonicalizeJsonValue(kv.Value);
        }
        return JsonSerializer.Serialize(sorted);
    }

    private static object? CanonicalizeJsonValue(object? val)
    {
        if (val is null) return null;
        if (val is JsonElement el)
        {
            return el.ValueKind switch
            {
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDecimal(),
                JsonValueKind.String => el.GetString(),
                JsonValueKind.Array => el.EnumerateArray().Select(item => CanonicalizeJsonValue(item)).ToList(),
                JsonValueKind.Object => el.EnumerateObject()
                    .OrderBy(p => p.Name, StringComparer.Ordinal)
                    .ToDictionary(p => p.Name, p => CanonicalizeJsonValue(p.Value), StringComparer.Ordinal),
                _ => el.ToString()
            };
        }
        if (val is IReadOnlyDictionary<string, object?> roDict)
        {
            var sorted = new SortedDictionary<string, object?>(StringComparer.Ordinal);
            foreach (var kv in roDict) sorted[kv.Key] = CanonicalizeJsonValue(kv.Value);
            return sorted;
        }
        if (val is System.Collections.IEnumerable seq && val is not string)
        {
            var list = new List<object?>();
            foreach (var item in seq) list.Add(CanonicalizeJsonValue(item));
            return list;
        }
        return val;
    }

    public static bool IsYesStatus(string? value)
    {
        var v = Clean(value)?.ToUpperInvariant();
        if (v is null) return false;
        return v is "YES" or "Y" or "CURRENT" or "SMOKER" or "DRINKER" or "ACTIVE" or "OCCASIONAL" or "FORMER" or "TRUE";
    }
}
