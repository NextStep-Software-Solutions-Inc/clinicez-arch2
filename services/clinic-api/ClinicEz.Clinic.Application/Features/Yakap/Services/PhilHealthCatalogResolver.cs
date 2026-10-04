using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;

namespace ClinicEz.Clinic.Application.Features.Yakap.Services;

/// <summary>
/// High-precision resolver and mapper between independent Clinic EMR data
/// (free-text clinical notes, local inventory names, and lab orders)
/// and official PhilHealth Konsulta / YAKAP statutory catalogs (lib_*).
/// </summary>
public static class PhilHealthCatalogResolver
{
    // ── 1. lib_mdisease: Past Medical History & Family History ──────────────────
    private static readonly (string Code, string CanonicalName, string[] Aliases)[] DiseaseRules =
    [
        ("011", "Essential Hypertension", ["hypertens", "hpn", "htn", "high blood", "elevated bp"]),
        ("006", "Diabetes Mellitus", ["diabet", "dm2", "t2dm", "t1dm", "niddm", "iddm", "hyperglycemia"]),
        ("002", "Bronchial Asthma", ["asthma", "reactive airway", "wheezing"]),
        ("001", "Allergies", ["allerg", "allergic rhinitis", "atopy", "urticaria"]),
        ("007", "COPD / Emphysema", ["copd", "emphysema", "chronic bronchitis"]),
        ("003", "Cancer / Malignancy", ["cancer", "malignan", "carcinoma", "tumor", "neoplasm", "leukemia", "lymphoma"]),
        ("004", "Cerebrovascular Disease (Stroke)", ["stroke", "cva", "cerebrovascular", "tia", "brain attack", "infarct"]),
        ("005", "Coronary Artery Disease", ["coronary", "cad", "ihd", "angina", "myocardial", "heart attack"]),
        ("010", "Hyperlipidemia / Dyslipidemia", ["dyslipid", "hyperlipid", "high cholesterol", "hypercholesterolemia", "triglyceride"]),
        ("015", "Tuberculosis", ["tuberculosis", "tb", "ptb", "koch", "mycobacter"]),
        ("008", "Epilepsy / Seizure Disorder", ["epilep", "seizure", "convulsion"]),
        ("009", "Hepatitis", ["hepatitis", "hepa b", "hepa a", "hepa c"]),
        ("012", "Peptic Ulcer Disease", ["peptic ulcer", "pud", "gastric ulcer", "duodenal ulcer", "hyperacidity", "gerd"]),
        ("013", "Pneumonia", ["pneumonia", "cap", "hap", "lung infection"]),
        ("014", "Thyroid Disease", ["thyroid", "goiter", "hyperthyroid", "hypothyroid"]),
        ("016", "Urinary Tract Infection", ["urinary tract infection", "uti", "pyelonephritis", "cystitis"])
    ];

    private static readonly string[] NegationPrefixes =
    [
        "no ", "denies ", "negative for ", "without ", "ruled out ", "r/o ", "non-", "not "
    ];

    public static (List<YakapMedicalHistoryDto> Histories, List<YakapSpecificHistoryDto> Specifics) ResolveMedicalHistories(
        string? chronicConditionsText,
        List<PhilHealthConditionEntryDto>? customMedicalHistories = null)
    {
        var histories = new List<YakapMedicalHistoryDto>();
        var specifics = new List<YakapSpecificHistoryDto>();
        var addedCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Priority 1: Explicitly selected options from Standalone Profile UI (100% precision)
        if (customMedicalHistories?.Count > 0)
        {
            foreach (var mh in customMedicalHistories)
            {
                if (!string.IsNullOrWhiteSpace(mh.Code) && addedCodes.Add(mh.Code))
                {
                    histories.Add(new YakapMedicalHistoryDto(mh.Code));
                    specifics.Add(new YakapSpecificHistoryDto(mh.Code, !string.IsNullOrWhiteSpace(mh.SpecificDesc) ? mh.SpecificDesc : "Documented"));
                }
            }
            if (histories.Count > 0)
                return (histories, specifics);
        }

        // Priority 2: Deterministic NLP resolution of free-text chronic conditions
        if (!string.IsNullOrWhiteSpace(chronicConditionsText))
        {
            var segments = chronicConditionsText.Split([';', ',', '/', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            foreach (var rawSegment in segments)
            {
                var lower = rawSegment.ToLowerInvariant();

                // Skip negated statements (e.g. "denies hypertension", "no diabetes")
                if (NegationPrefixes.Any(neg => lower.StartsWith(neg) || lower.Contains(" " + neg)))
                    continue;

                bool matched = false;
                foreach (var (code, canonicalName, aliases) in DiseaseRules)
                {
                    if (aliases.Any(alias => Regex.IsMatch(lower, $@"\b{Regex.Escape(alias)}\b", RegexOptions.IgnoreCase) || lower.Contains(alias)))
                    {
                        if (addedCodes.Add(code))
                        {
                            histories.Add(new YakapMedicalHistoryDto(code));
                            specifics.Add(new YakapSpecificHistoryDto(code, canonicalName));
                        }
                        matched = true;
                    }
                }

                // If clinician entered an uncataloged condition, safely map to code "99" (Others)
                if (!matched && !string.IsNullOrWhiteSpace(rawSegment) && addedCodes.Add("99_" + rawSegment))
                {
                    histories.Add(new YakapMedicalHistoryDto("99"));
                    specifics.Add(new YakapSpecificHistoryDto("99", rawSegment.Length > 50 ? rawSegment[..50] : rawSegment));
                }
            }
        }

        // Priority 3: Statutory DTD '+' fallback if completely unrecorded
        if (histories.Count == 0)
        {
            histories.Add(new YakapMedicalHistoryDto("99"));
            specifics.Add(new YakapSpecificHistoryDto("99", "None"));
        }

        return (histories, specifics);
    }

    // ── 2. lib_signssymptoms: Signs & Symptoms Resolution ─────────────────────
    private static readonly (string Code, string[] Keywords)[] SymptomRules =
    [
        ("37", ["hypertens", "high blood", "elevated bp", "hpn"]),
        ("13", ["fever", "lagnat", "febrile", "pyrexia", "chills"]),
        ("7",  ["cough", "ubo", "tussis"]),
        ("14", ["headache", "sakit ng ulo", "cephalalgia", "migraine"]),
        ("5",  ["chest pain", "angina", "paninikip ng dibdib"]),
        ("2",  ["abdominal pain", "sakit ng tiyan", "stomach ache", "cramps"]),
        ("10", ["dyspnea", "shortness of breath", "hirap huminga", "breathlessness"]),
        ("9",  ["dizziness", "vertigo", "hilo", "lightheaded"]),
        ("24", ["vomit", "pagsusuka", "emesis"]),
        ("19", ["nausea", "nasusuka"]),
        ("8",  ["diarrhea", "pagtatae", "loose stool"]),
        ("21", ["rash", "skin lesion", "kati", "pruritus"]),
        ("38", ["pain", "masakit", "body ache", "myalgia", "arthralgia"])
    ];

    public static (string SignsSymptoms, string? OtherComplaint) ResolveSignsAndSymptoms(string? subjectiveText)
    {
        if (string.IsNullOrWhiteSpace(subjectiveText))
        {
            return ("X", "Routine consultation / baseline profiling");
        }

        var lower = subjectiveText.ToLowerInvariant();
        var matchedCodes = new List<string>();

        foreach (var (code, keywords) in SymptomRules)
        {
            if (keywords.Any(k => lower.Contains(k)))
            {
                matchedCodes.Add(code);
            }
        }

        // DTD schema requires that if "X" is emitted, pOtherComplaint must be provided.
        // If specific symptoms were detected, we format as e.g. "13;7;X" so that both the
        // statutory code and the doctor's free-text explanation are preserved.
        if (matchedCodes.Count > 0)
        {
            matchedCodes.Add("X");
            return (string.Join(";", matchedCodes), subjectiveText);
        }

        // Fallback for unclassified subjective text: Code "X" (Other complaint)
        return ("X", subjectiveText);
    }

    // ── 3. lib_medicine: Essential GAMOT Formulary 30-Char UPSC Resolution ────
    private static readonly (string Code, string Generic, string Strength)[] GamotFormulary =
    [
        ("AMLOD0000000005TAB00000000100", "amlodipine", "5"),
        ("AMLOD0000000010TAB00000000100", "amlodipine", "10"),
        ("LOSAR0000000050TAB00000000100", "losartan", "50"),
        ("LOSAR0000000100TAB00000000100", "losartan", "100"),
        ("METOP0000000050TAB00000000100", "metoprolol", "50"),
        ("ENALA0000000010TAB00000000100", "enalapril", "10"),
        ("METFO0000000500TAB00000000100", "metformin", "500"),
        ("GLICL0000000080TAB00000000100", "gliclazide", "80"),
        ("GLICL0000000030TAB00000000100", "gliclazide", "30"),
        ("GLIME0000000002TAB00000000100", "glimepiride", "2"),
        ("SIMVA0000000020TAB00000000100", "simvastatin", "20"),
        ("SIMVA0000000040TAB00000000100", "simvastatin", "40"),
        ("ATORV0000000020TAB00000000100", "atorvastatin", "20"),
        ("ATORV0000000040TAB00000000100", "atorvastatin", "40"),
        ("SALBU0000000100INH00000000001", "salbutamol", "100"),
        ("SALBU0000000002NEB00000000030", "salbutamol", "2"),
        ("AMOXC0000000500CAP00000000100", "amoxicillin", "500"),
        ("COAMO0000000625TAB00000000100", "co-amoxiclav", "625"),
        ("AZITH0000000500TAB00000000003", "azithromycin", "500"),
        ("CIPRO0000000500TAB00000000100", "ciprofloxacin", "500"),
        ("COTRI0000000800TAB00000000100", "cotrimoxazole", "800"),
        ("PARAC0000000500TAB00000000100", "paracetamol", "500"),
        ("IBUPR0000000200TAB00000000100", "ibuprofen", "200"),
        ("MEFEN0000000500CAP00000000100", "mefenamic", "500"),
        ("OMEPZ0000000020CAP00000000100", "omeprazole", "20"),
        ("ORSOL0000000000SACH0000000025", "ors", "")
    ];

    public static string ResolveDrugCode(string? genericName, string? dosage = null)
    {
        if (string.IsNullOrWhiteSpace(genericName))
            return "NOMED0000000000000000000000000";

        var clean = genericName.Trim();

        // 1. If the clinic already bound the official 30-char PhilHealth code, preserve it
        if (clean.Length == 30 && clean.All(char.IsLetterOrDigit))
            return clean.ToUpperInvariant();

        var genLower = clean.ToLowerInvariant();
        var doseLower = (dosage ?? string.Empty).ToLowerInvariant();

        // 2. High-precision lookup in official GAMOT Formulary
        foreach (var (code, gen, strength) in GamotFormulary)
        {
            if (genLower.Contains(gen))
            {
                if (string.IsNullOrEmpty(strength) || genLower.Contains(strength) || doseLower.Contains(strength))
                {
                    return code;
                }
            }
        }

        // 3. Fallback: Sanitize & zero-pad to exactly 30 characters for non-formulary EMR medications
        var alphanumeric = new string(clean.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        if (alphanumeric.Length >= 30)
            return alphanumeric[..30];

        return alphanumeric.PadRight(30, '0');
    }

    // ── 4. lib_diagnostic: 13 Yakap Laboratory & Imaging Services ─────────────
    private static readonly (string Code, string[] Aliases)[] DiagnosticRules =
    [
        ("1",  ["cbc", "complete blood count", "platelet count", "hemoglobin", "hematocrit"]),
        ("2",  ["urinalysis", "urine routine", "routine urinalysis"]),
        ("3",  ["fecalysis", "stool exam", "routine stool"]),
        ("4",  ["sputum", "genexpert", "afb", "acid fast bacilli"]),
        ("5",  ["fbs", "fasting blood sugar", "fasting blood glucose"]),
        ("6",  ["rbs", "random blood sugar", "random blood glucose"]),
        ("7",  ["ogtt", "oral glucose tolerance"]),
        ("8",  ["lipid", "cholesterol", "triglyceride", "hdl", "ldl"]),
        ("9",  ["creatinine", "serum creatinine"]),
        ("10", ["hba1c", "glycated hemoglobin"]),
        ("11", ["chest x-ray", "chest xray", "cxr", "chest radiograph"]),
        ("12", ["ecg", "electrocardiogram", "12-lead"]),
        ("13", ["pap smear", "via", "cervical screening", "acetic acid"]),
        ("14", ["fobt", "fecal occult blood"]),
        ("15", ["ppd", "mantoux", "tuberculin"])
    ];

    public static string ResolveDiagnosticCode(string? testName)
    {
        if (string.IsNullOrWhiteSpace(testName))
            return "99";

        var lower = testName.ToLowerInvariant();
        foreach (var (code, aliases) in DiagnosticRules)
        {
            if (aliases.Any(a => lower.Contains(a)))
                return code;
        }

        return "99"; // Other Diagnostic Exam
    }
}
