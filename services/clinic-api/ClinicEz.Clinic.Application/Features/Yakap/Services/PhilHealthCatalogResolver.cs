using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;

namespace ClinicEz.Clinic.Application.Features.Yakap.Services;

/// <summary>
/// Resolver and mapper between independent Clinic EMR data (free-text clinical notes, local inventory names, and
/// lab orders) and the official PhilHealth Konsulta / YAKAP libraries (<c>lib_*</c>).
/// <para>
/// The wording rules below (which phrases mean which condition) are clinical heuristics. The <b>codes</b> are never
/// written here: every code is looked up in the PhilHealth Catalog by its official description, so a new kit version
/// is picked up without a code change and a library that is not loaded can never produce a made-up code.
/// </para>
/// </summary>
public sealed class PhilHealthCatalogResolver
{
    public const string MedicineLibrary = "lib_medicine";
    public const string MedicalHistoryLibrary = "lib_mdiseases";
    public const string DiagnosticLibrary = "lib_diagnostic";

    /// <summary>PhilHealth's own placeholder for "no medicine needed in this episode of care" (first row of lib_medicine).</summary>
    public const string NoMedicineCode = "NOMED0000000000000000000000000";

    private readonly IPhilHealthCatalogLookup _catalog;

    public PhilHealthCatalogResolver(IPhilHealthCatalogLookup catalog) => _catalog = catalog;

    // ---- 1. lib_mdiseases: past medical history & family history ---------------------------------------------------

    private static readonly (string CatalogDescription, string[] Aliases)[] DiseaseRules =
    [
        ("Hypertension", ["hypertens", "hpn", "htn", "high blood", "elevated bp"]),
        ("Diabetes Mellitus", ["diabet", "dm2", "t2dm", "t1dm", "niddm", "iddm", "hyperglycemia"]),
        ("Asthma", ["asthma", "reactive airway", "wheezing"]),
        ("Allergy", ["allerg", "allergic rhinitis", "atopy", "urticaria"]),
        ("Emphysema", ["copd", "emphysema", "chronic bronchitis"]),
        ("Cancer", ["cancer", "malignan", "carcinoma", "tumor", "neoplasm", "leukemia", "lymphoma"]),
        ("Cerebrovascular Disease", ["stroke", "cva", "cerebrovascular", "tia", "brain attack", "infarct"]),
        ("Coronary Artery Disease", ["coronary", "cad", "ihd", "angina", "myocardial", "heart attack"]),
        ("Hyperlipidemia", ["dyslipid", "hyperlipid", "high cholesterol", "hypercholesterolemia", "triglyceride"]),
        ("Extrapulmonary Tuberculosis", ["extrapulmonary", "extra-pulmonary", "tb meningitis", "spinal tb", "pott"]),
        ("Pulmonary Tuberculosis", ["tuberculosis", "tb", "ptb", "koch", "mycobacter"]),
        ("Epilepsy/Seizure Disorder", ["epilep", "seizure", "convulsion"]),
        ("Hepatitis", ["hepatitis", "hepa b", "hepa a", "hepa c"]),
        ("Peptic Ulcer", ["peptic ulcer", "pud", "gastric ulcer", "duodenal ulcer", "hyperacidity", "gerd"]),
        ("Pneumonia", ["pneumonia", "cap", "hap", "lung infection"]),
        ("Thyroid Disease", ["thyroid", "goiter", "hyperthyroid", "hypothyroid"]),
        ("Urinary Tract Infection", ["urinary tract infection", "uti", "pyelonephritis", "cystitis"]),
        ("Mental Illness", ["mental illness", "depress", "anxiety", "psychosis", "schizophren", "bipolar"]),
    ];

    private static readonly string[] NegationPrefixes =
    [
        "no ", "denies ", "negative for ", "without ", "ruled out ", "r/o ", "non-", "not "
    ];

    public (List<YakapMedicalHistoryDto> Histories, List<YakapSpecificHistoryDto> Specifics) ResolveMedicalHistories(
        string? chronicConditionsText,
        List<PhilHealthConditionEntryDto>? customMedicalHistories = null)
    {
        var histories = new List<YakapMedicalHistoryDto>();
        var specifics = new List<YakapSpecificHistoryDto>();
        var addedCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Priority 1: options the clinician explicitly selected from the catalog (full precision)
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

        var others = OthersMedicalHistoryCode();

        // Priority 2: deterministic resolution of free-text chronic conditions
        if (!string.IsNullOrWhiteSpace(chronicConditionsText))
        {
            var segments = chronicConditionsText.Split([';', ',', '/', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            foreach (var rawSegment in segments)
            {
                var lower = rawSegment.ToLowerInvariant();

                // Skip negated statements (e.g. "denies hypertension", "no diabetes")
                if (NegationPrefixes.Any(neg => lower.StartsWith(neg) || lower.Contains(" " + neg)))
                    continue;

                var matched = false;
                foreach (var (catalogDescription, aliases) in DiseaseRules)
                {
                    if (!aliases.Any(alias => Regex.IsMatch(lower, $@"\b{Regex.Escape(alias)}\b", RegexOptions.IgnoreCase) || lower.Contains(alias)))
                        continue;

                    var entry = _catalog.FindByDescription(MedicalHistoryLibrary, catalogDescription);
                    if (entry is null) continue; // not in the loaded catalog: never invent a code

                    if (addedCodes.Add(entry.Code))
                    {
                        histories.Add(new YakapMedicalHistoryDto(entry.Code));
                        specifics.Add(new YakapSpecificHistoryDto(entry.Code, entry.Description));
                    }
                    matched = true;
                }

                // An uncatalogued condition entered by the clinician maps to the library's "Others".
                if (!matched && others is not null && !string.IsNullOrWhiteSpace(rawSegment) && addedCodes.Add(others + "_" + rawSegment))
                {
                    histories.Add(new YakapMedicalHistoryDto(others));
                    specifics.Add(new YakapSpecificHistoryDto(others, rawSegment.Length > 50 ? rawSegment[..50] : rawSegment));
                }
            }
        }

        // Priority 3: statutory fallback when nothing is recorded ("None")
        if (histories.Count == 0)
        {
            var none = _catalog.FindByDescription(MedicalHistoryLibrary, "None");
            if (none is not null)
            {
                histories.Add(new YakapMedicalHistoryDto(none.Code));
                specifics.Add(new YakapSpecificHistoryDto(none.Code, none.Description));
            }
        }

        return (histories, specifics);
    }

    /// <summary>
    /// Conditions named in free text that the catalog recognises, with their official code and description. Unlike
    /// <see cref="ResolveMedicalHistories"/> it adds no "Others"/"None" filler, so it suits pre-filling a profile for review.
    /// </summary>
    public List<PhilHealthConditionEntryDto> ResolveKnownConditions(string? chronicConditionsText)
    {
        var found = new List<PhilHealthConditionEntryDto>();
        if (string.IsNullOrWhiteSpace(chronicConditionsText)) return found;

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var segments = chronicConditionsText.Split([';', ',', '/', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var segment in segments)
        {
            var lower = segment.ToLowerInvariant();
            if (NegationPrefixes.Any(neg => lower.StartsWith(neg) || lower.Contains(" " + neg))) continue;

            foreach (var (catalogDescription, aliases) in DiseaseRules)
            {
                if (!aliases.Any(alias => Regex.IsMatch(lower, $@"\b{Regex.Escape(alias)}\b", RegexOptions.IgnoreCase) || lower.Contains(alias)))
                    continue;
                var entry = _catalog.FindByDescription(MedicalHistoryLibrary, catalogDescription);
                if (entry is not null && seen.Add(entry.Code))
                    found.Add(new PhilHealthConditionEntryDto(entry.Code, entry.Description));
            }
        }
        return found;
    }

    private string? OthersMedicalHistoryCode() => _catalog.FindByDescription(MedicalHistoryLibrary, "Others")?.Code;

    // ---- 2. lib_medicine: 30-character drug codes ---------------------------------------------------------------

    public string ResolveDrugCode(string? genericName, string? dosage = null)
    {
        if (string.IsNullOrWhiteSpace(genericName))
            return NoMedicineCode;

        var clean = genericName.Trim();

        // 1. If the clinic already bound the official 30-char PhilHealth code, preserve it
        if (clean.Length == 30 && clean.All(char.IsLetterOrDigit))
            return clean.ToUpperInvariant();

        // 2. Look the medicine up in lib_medicine: generic name, and strength when one is given
        var match = FindMedicine(clean, dosage);
        if (match is not null)
            return match.Code;

        // 3. Not in the catalog: sanitise and zero-pad to 30 characters so the transmittal validation flags it for mapping
        var alphanumeric = new string(clean.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        return alphanumeric.Length >= 30 ? alphanumeric[..30] : alphanumeric.PadRight(30, '0');
    }

    private PhilHealthCatalogRecord? FindMedicine(string genericName, string? dosage)
    {
        // "Amlodipine 5 mg tablet" -> generic word(s) "amlodipine"; strength "5 mg" comes from the name or the dosage.
        var strength = ExtractStrength(genericName) ?? ExtractStrength(dosage);
        var words = Regex.Split(genericName.ToLowerInvariant(), @"[^a-z\-]+")
            .Where(w => w.Length >= 3 && w is not ("mg" or "mcg" or "tab" or "tablet" or "cap" or "capsule" or "ml" or "syrup" or "the" or "and"))
            .ToArray();
        if (words.Length == 0) return null;

        var candidates = _catalog.Search(MedicineLibrary, [words[0]], limit: 500);
        if (candidates.Count == 0) return null;

        IEnumerable<PhilHealthCatalogRecord> narrowed = candidates;
        foreach (var word in words.Skip(1))
        {
            var withWord = narrowed.Where(c => c.Description.Contains(word, StringComparison.OrdinalIgnoreCase)).ToList();
            if (withWord.Count > 0) narrowed = withWord;
        }

        if (strength is not null)
        {
            var pattern = new Regex($@"(?<![\d.]){Regex.Escape(strength).Replace("\\ ", @"\s*")}(?![\d.])", RegexOptions.IgnoreCase);
            var withStrength = narrowed.Where(c => pattern.IsMatch(c.Description)).ToList();
            return withStrength.OrderBy(c => c.Description.Length).ThenBy(c => c.Code, StringComparer.Ordinal).FirstOrDefault();
        }

        // Without a strength only an unambiguous generic can be resolved.
        var list = narrowed.ToList();
        return list.Count == 1 ? list[0] : null;
    }

    private static string? ExtractStrength(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var m = Regex.Match(text, @"(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu)\b", RegexOptions.IgnoreCase);
        return m.Success ? $"{m.Groups[1].Value} {m.Groups[2].Value.ToLowerInvariant()}" : null;
    }

    // ---- 3. lib_diagnostic: laboratory & imaging services --------------------------------------------------------

    private static readonly (string CatalogDescription, string[] Aliases)[] DiagnosticRules =
    [
        ("Complete Blood Count", ["cbc", "complete blood count", "hemoglobin", "hematocrit"]),
        ("Platelet", ["platelet count"]),
        ("Urinalysis", ["urinalysis", "urine routine", "routine urinalysis"]),
        ("Fecalysis", ["fecalysis", "stool exam", "routine stool"]),
        ("Sputum Microscopy", ["sputum", "genexpert", "afb", "acid fast bacilli"]),
        ("Fasting Blood Sugar", ["fbs", "fasting blood sugar", "fasting blood glucose"]),
        ("Random Blood Sugar", ["rbs", "random blood sugar", "random blood glucose"]),
        ("Oral Glucose Tolerance Test", ["ogtt", "oral glucose tolerance"]),
        ("Lipid Profile", ["lipid", "cholesterol", "triglyceride", "hdl", "ldl"]),
        ("Creatinine", ["creatinine", "serum creatinine"]),
        ("HbA1c", ["hba1c", "glycated hemoglobin"]),
        ("Chest X-Ray", ["chest x-ray", "chest xray", "cxr", "chest radiograph"]),
        ("Electrocardiogram (ECG)", ["ecg", "electrocardiogram", "12-lead"]),
        ("Paps Smear", ["pap smear", "paps smear", "cervical screening"]),
        ("Fecal Occult Blood", ["fobt", "fecal occult blood"]),
        ("PPD Test (Tuberculosis)", ["ppd", "mantoux", "tuberculin"]),
    ];

    /// <summary>The library's "Others" code, used when a test is not one of the catalogued services.</summary>
    public string OtherDiagnosticCode() => _catalog.FindByDescription(DiagnosticLibrary, "Others")?.Code ?? string.Empty;

    public string ResolveDiagnosticCode(string? testName)
    {
        if (string.IsNullOrWhiteSpace(testName))
            return OtherDiagnosticCode();

        var lower = testName.ToLowerInvariant();
        foreach (var (catalogDescription, aliases) in DiagnosticRules)
        {
            if (!aliases.Any(a => lower.Contains(a))) continue;
            var entry = _catalog.FindByDescription(DiagnosticLibrary, catalogDescription);
            if (entry is not null) return entry.Code;
        }

        return OtherDiagnosticCode();
    }

    public const string SignsSymptomsLibrary = "lib_signs_symptoms";
    public const string ManagementLibrary = "lib_management";
    public const string ChildImmunizationLibrary = "lib_immchild";

    /// <summary>The library's "Others" code for signs and symptoms.</summary>
    public string OtherSignsSymptomsCode() => _catalog.FindByDescription(SignsSymptomsLibrary, "Others")?.Code ?? string.Empty;

    /// <summary>
    /// The sign/symptom whose official term appears in the free-text complaint (longest term wins so that
    /// "chest pain" is not read as plain "pain"), otherwise the library's "Others".
    /// </summary>
    public string ResolveSignsSymptomsCode(string? complaintText)
    {
        if (string.IsNullOrWhiteSpace(complaintText)) return OtherSignsSymptomsCode();

        var text = complaintText.ToLowerInvariant();
        string? bestCode = null;
        var bestLength = 0;

        foreach (var record in _catalog.List(SignsSymptomsLibrary))
        {
            if (!record.IsActive || record.Description.Equals("Others", StringComparison.OrdinalIgnoreCase)) continue;

            // "VOMITING/NAUSEA" and "ABDOMINAL CRAMP/PAIN" list alternative terms separated by '/'.
            foreach (var term in record.Description.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var needle = term.ToLowerInvariant();
                if (needle.Length < 4 || needle.Length <= bestLength || !text.Contains(needle)) continue;
                bestCode = record.Code;
                bestLength = needle.Length;
            }
        }

        return bestCode ?? OtherSignsSymptomsCode();
    }

    /// <summary>
    /// Management entry for the SOAP: <c>Not applicable</c> when nothing is documented, otherwise the library's
    /// <c>Others</c> (the clinician's own advice is carried as its description).
    /// </summary>
    public string ResolveManagementCode(bool hasAdvice)
    {
        var entry = _catalog.FindByDescription(ManagementLibrary, hasAdvice ? "Others" : "Not applicable");
        return entry?.Code ?? string.Empty;
    }

    /// <summary>The library's "Essentially normal" finding for an examination library, or empty if it has none.</summary>
    public string EssentiallyNormalCode(string library) =>
        _catalog.List(library)
            .FirstOrDefault(r => r.IsActive && r.Description.StartsWith("Essentially normal", StringComparison.OrdinalIgnoreCase))
            ?.Code ?? string.Empty;

    /// <summary>
    /// Organ-system defaults used until the clinician records the examination: each library's own
    /// "Essentially normal" entry (the codes differ per library, so they can never be written as literals).
    /// </summary>
    public YakapPhysicalExamMiscDto EssentiallyNormalExam() => new(
        SkinId: EssentiallyNormalCode("lib_skin_extremities"),
        HeentId: EssentiallyNormalCode("lib_heent"),
        ChestId: EssentiallyNormalCode("lib_chest"),
        HeartId: EssentiallyNormalCode("lib_heart"),
        AbdomenId: EssentiallyNormalCode("lib_abdomen"),
        NeuroId: EssentiallyNormalCode("lib_neuro"),
        RectalId: EssentiallyNormalCode("lib_digital_rectal"),
        GuId: EssentiallyNormalCode("lib_genitourinary"));
    /// <summary>The "None" immunization code (shared by all immunization libraries).</summary>
    public string NoImmunizationCode() => _catalog.FindByDescription(ChildImmunizationLibrary, "None")?.Code ?? string.Empty;
}

