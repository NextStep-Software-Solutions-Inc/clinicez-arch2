using System;
using System.Linq;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Services;

public record AnalyteStandardSpec(
    string PanelName,
    string AnalyteCode,
    string AnalyteName,
    string Unit,
    string ReferenceInterval,
    double? MaleMin = null,
    double? MaleMax = null,
    double? FemaleMin = null,
    double? FemaleMax = null,
    double? PediatricMin = null,
    double? PediatricMax = null,
    double? CriticalLow = null,
    double? CriticalHigh = null,
    string[]? QualitativeNormal = null,
    string[]? QualitativeCritical = null
);

public static class ReferenceRangeEvaluator
{
    public static readonly AnalyteStandardSpec[] Catalog =
    [
        // ==========================================
        // 1. Hematology (Complete Blood Count + Diff)
        // ==========================================
        new("Complete Blood Count (CBC)", "HGB", "Hemoglobin", "g/dL", "M: 13.5-17.5 • F: 12.0-15.5 • Ped: 11.0-14.0", 13.5, 17.5, 12.0, 15.5, 11.0, 14.0, 7.0, 20.0),
        new("Complete Blood Count (CBC)", "HCT", "Hematocrit", "%", "M: 41.0-50.0 • F: 36.0-44.0 • Ped: 33.0-42.0", 41.0, 50.0, 36.0, 44.0, 33.0, 42.0, 21.0, 60.0),
        new("Complete Blood Count (CBC)", "RBC", "Red Blood Cells", "x10^6/uL", "M: 4.30-5.90 • F: 3.80-5.20", 4.30, 5.90, 3.80, 5.20, 3.80, 5.50, 2.0, 7.0),
        new("Complete Blood Count (CBC)", "MCV", "Mean Corpuscular Volume", "fL", "80.0 - 100.0", 80.0, 100.0, 80.0, 100.0, 76.0, 96.0, null, null),
        new("Complete Blood Count (CBC)", "MCH", "Mean Corpuscular Hemoglobin", "pg", "27.0 - 33.0", 27.0, 33.0, 27.0, 33.0, 25.0, 33.0, null, null),
        new("Complete Blood Count (CBC)", "MCHC", "MCHC", "g/dL", "32.0 - 36.0", 32.0, 36.0, 32.0, 36.0, 32.0, 36.0, null, null),
        new("Complete Blood Count (CBC)", "RDW", "Red Cell Distribution Width", "%", "11.5 - 14.5", 11.5, 14.5, 11.5, 14.5, 11.5, 14.5, null, null),
        new("Complete Blood Count (CBC)", "WBC", "White Blood Cells", "x10^3/uL", "Adult: 4.5-10.0 • Ped: 5.0-15.5", 4.5, 10.0, 4.5, 10.0, 5.0, 15.5, 2.0, 30.0),
        new("Complete Blood Count (CBC)", "NEUT", "Neutrophils (Segmenters)", "%", "50.0 - 70.0", 50.0, 70.0, 50.0, 70.0, 40.0, 65.0, null, null),
        new("Complete Blood Count (CBC)", "LYMPH", "Lymphocytes", "%", "20.0 - 40.0", 20.0, 40.0, 20.0, 40.0, 25.0, 50.0, null, null),
        new("Complete Blood Count (CBC)", "MONO", "Monocytes", "%", "2.0 - 8.0", 2.0, 8.0, 2.0, 8.0, 2.0, 8.0, null, null),
        new("Complete Blood Count (CBC)", "EOS", "Eosinophils", "%", "1.0 - 4.0", 1.0, 4.0, 1.0, 4.0, 1.0, 4.0, null, null),
        new("Complete Blood Count (CBC)", "BASO", "Basophils", "%", "0.0 - 1.0", 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, null, null),
        new("Complete Blood Count (CBC)", "PLT", "Platelets", "x10^3/uL", "150 - 450", 150.0, 450.0, 150.0, 450.0, 150.0, 450.0, 50.0, 1000.0),

        // ==========================================
        // 2. Clinical Chemistry
        // ==========================================
        new("Clinical Chemistry", "FBS", "Fasting Blood Sugar", "mg/dL", "70.0 - 99.0", 70.0, 99.0, 70.0, 99.0, 60.0, 100.0, 50.0, 400.0),
        new("Clinical Chemistry", "HBA1C", "Glycated Hemoglobin (HbA1c)", "%", "4.0 - 5.6", 4.0, 5.6, 4.0, 5.6, 4.0, 5.6, null, 10.0),
        new("Clinical Chemistry", "CREA", "Serum Creatinine", "mg/dL", "M: 0.7-1.3 • F: 0.6-1.1 • Ped: 0.3-0.7", 0.7, 1.3, 0.6, 1.1, 0.3, 0.7, 0.3, 5.0),
        new("Clinical Chemistry", "BUN", "Blood Urea Nitrogen", "mg/dL", "7.0 - 20.0 • Ped: 5.0-18.0", 7.0, 20.0, 7.0, 20.0, 5.0, 18.0, 3.0, 60.0),
        new("Clinical Chemistry", "URIC", "Serum Uric Acid", "mg/dL", "M: 3.5-7.2 • F: 2.6-6.0", 3.5, 7.2, 2.6, 6.0, 2.0, 5.5, null, 12.0),
        new("Clinical Chemistry", "CHOL", "Total Cholesterol", "mg/dL", "< 200.0 (Desirable)", 0.0, 200.0, 0.0, 200.0, 0.0, 170.0, null, 350.0),
        new("Clinical Chemistry", "TRIG", "Triglycerides", "mg/dL", "< 150.0 (Normal)", 0.0, 150.0, 0.0, 150.0, 0.0, 100.0, null, 500.0),
        new("Clinical Chemistry", "HDL", "HDL Cholesterol", "mg/dL", "> 40.0 (Protective)", 40.0, 100.0, 40.0, 100.0, 40.0, 100.0, null, null),
        new("Clinical Chemistry", "LDL", "LDL Cholesterol", "mg/dL", "< 100.0 (Optimal)", 0.0, 100.0, 0.0, 100.0, 0.0, 110.0, null, 190.0),
        new("Clinical Chemistry", "SGPT_ALT", "Alanine Aminotransferase (ALT)", "U/L", "7.0 - 56.0", 7.0, 56.0, 7.0, 56.0, 5.0, 45.0, null, 300.0),
        new("Clinical Chemistry", "SGOT_AST", "Aspartate Aminotransferase (AST)", "U/L", "10.0 - 40.0", 10.0, 40.0, 10.0, 40.0, 10.0, 45.0, null, 300.0),
        new("Clinical Chemistry", "TBIL", "Total Bilirubin", "mg/dL", "0.2 - 1.2", 0.2, 1.2, 0.2, 1.2, 0.2, 1.0, null, 15.0),
        new("Clinical Chemistry", "DBIL", "Direct Bilirubin", "mg/dL", "0.0 - 0.3", 0.0, 0.3, 0.0, 0.3, 0.0, 0.3, null, null),
        new("Clinical Chemistry", "ALKP", "Alkaline Phosphatase", "U/L", "44.0 - 147.0 • Ped: 100.0-350.0", 44.0, 147.0, 44.0, 147.0, 100.0, 350.0, null, 600.0),
        new("Clinical Chemistry", "TP", "Total Protein", "g/dL", "6.0 - 8.3", 6.0, 8.3, 6.0, 8.3, 5.6, 7.5, null, null),
        new("Clinical Chemistry", "ALB", "Albumin", "g/dL", "3.5 - 5.0", 3.5, 5.0, 3.5, 5.0, 3.5, 5.0, 2.0, null),
        new("Clinical Chemistry", "NA", "Serum Sodium", "mmol/L", "135.0 - 145.0", 135.0, 145.0, 135.0, 145.0, 135.0, 145.0, 120.0, 160.0),
        new("Clinical Chemistry", "K", "Serum Potassium", "mmol/L", "3.5 - 5.1", 3.5, 5.1, 3.5, 5.1, 3.5, 5.5, 2.8, 6.2),
        new("Clinical Chemistry", "CL", "Serum Chloride", "mmol/L", "96.0 - 106.0", 96.0, 106.0, 96.0, 106.0, 96.0, 108.0, 80.0, 120.0),

        // ==========================================
        // 3. Complete Urinalysis (Physical, Chem, Micro)
        // ==========================================
        new("Urinalysis", "URI_COLOR", "Color", "", "Straw / Light Yellow", QualitativeNormal: ["Straw", "Light Yellow", "Yellow", "Pale Yellow"]),
        new("Urinalysis", "URI_TRANS", "Clarity / Transparency", "", "Clear / Slightly Hazy", QualitativeNormal: ["Clear", "Slightly Hazy"]),
        new("Urinalysis", "URI_SPGR", "Specific Gravity", "", "1.005 - 1.030", 1.005, 1.030, 1.005, 1.030, 1.005, 1.030, 1.000, 1.040),
        new("Urinalysis", "URI_PH", "pH", "", "5.0 - 8.0", 5.0, 8.0, 5.0, 8.0, 5.0, 8.0, 4.0, 9.0),
        new("Urinalysis", "URI_PROT", "Protein", "", "Negative", QualitativeNormal: ["Negative", "Trace"], QualitativeCritical: ["3+", "4+", "Heavy"]),
        new("Urinalysis", "URI_GLUC", "Glucose", "", "Negative", QualitativeNormal: ["Negative"], QualitativeCritical: ["3+", "4+"]),
        new("Urinalysis", "URI_KETO", "Ketones", "", "Negative", QualitativeNormal: ["Negative"], QualitativeCritical: ["Large", "3+", "4+"]),
        new("Urinalysis", "URI_BILI", "Bilirubin", "", "Negative", QualitativeNormal: ["Negative"], QualitativeCritical: ["Positive", "Large"]),
        new("Urinalysis", "URI_BLD", "Occult Blood", "", "Negative", QualitativeNormal: ["Negative", "Trace"], QualitativeCritical: ["3+", "Large"]),
        new("Urinalysis", "URI_LEUK", "Leukocyte Esterase", "", "Negative", QualitativeNormal: ["Negative"]),
        new("Urinalysis", "URI_NIT", "Nitrite", "", "Negative", QualitativeNormal: ["Negative"]),
        new("Urinalysis", "URI_RBC", "RBC (Urine)", "/hpf", "0 - 2", 0.0, 2.0, 0.0, 2.0, 0.0, 2.0, null, 25.0),
        new("Urinalysis", "URI_WBC", "WBC (Urine)", "/hpf", "0 - 5", 0.0, 5.0, 0.0, 5.0, 0.0, 5.0, null, 30.0),
        new("Urinalysis", "URI_EPITH", "Epithelial Cells", "", "None / Rare / Few", QualitativeNormal: ["None", "Rare", "Few"]),
        new("Urinalysis", "URI_BACT", "Bacteria", "", "None / Rare", QualitativeNormal: ["None", "Rare", "Negative"]),

        // ==========================================
        // 4. Serology & Infectious Diseases
        // ==========================================
        new("Serology & Immunology", "DENGUE_NS1", "Dengue NS1 Antigen", "", "Non-Reactive", QualitativeNormal: ["Non-Reactive", "Negative"], QualitativeCritical: ["Reactive", "Positive"]),
        new("Serology & Immunology", "DENGUE_IGG", "Dengue IgG Antibody", "", "Non-Reactive", QualitativeNormal: ["Non-Reactive", "Negative"]),
        new("Serology & Immunology", "DENGUE_IGM", "Dengue IgM Antibody", "", "Non-Reactive", QualitativeNormal: ["Non-Reactive", "Negative"], QualitativeCritical: ["Reactive", "Positive"]),
        new("Serology & Immunology", "HBSAG", "Hepatitis B Surface Antigen", "", "Non-Reactive", QualitativeNormal: ["Non-Reactive", "Negative"], QualitativeCritical: ["Reactive", "Positive"]),
        new("Serology & Immunology", "HCV_AB", "Anti-HCV Antibody", "", "Non-Reactive", QualitativeNormal: ["Non-Reactive", "Negative"], QualitativeCritical: ["Reactive", "Positive"]),
        new("Serology & Immunology", "SYPHILIS_RPR", "Syphilis RPR / VDRL", "", "Non-Reactive", QualitativeNormal: ["Non-Reactive", "Negative"], QualitativeCritical: ["Reactive", "Positive"]),
        new("Serology & Immunology", "HIV_COMBO", "HIV 1/2 Ag/Ab Combo Screen", "", "Non-Reactive", QualitativeNormal: ["Non-Reactive", "Negative"], QualitativeCritical: ["Reactive", "Positive"]),

        // ==========================================
        // 5. Immunoassay & Endocrinology
        // ==========================================
        new("Immunoassay & Endocrinology", "TSH", "Thyroid Stimulating Hormone (TSH)", "uIU/mL", "0.40 - 4.20", 0.40, 4.20, 0.40, 4.20, 0.50, 5.00, 0.05, 20.0),
        new("Immunoassay & Endocrinology", "FT3", "Free Triiodothyronine (FT3)", "pg/mL", "2.00 - 4.40", 2.00, 4.40, 2.00, 4.40, 2.00, 4.40, 1.0, 10.0),
        new("Immunoassay & Endocrinology", "FT4", "Free Thyroxine (FT4)", "ng/dL", "0.93 - 1.70", 0.93, 1.70, 0.93, 1.70, 0.93, 1.70, 0.3, 4.0),
        new("Immunoassay & Endocrinology", "PSA", "Total Prostate-Specific Antigen", "ng/mL", "< 4.00 (Normal)", 0.0, 4.00, 0.0, 4.00, null, null, null, 20.0),
        new("Immunoassay & Endocrinology", "BHCG", "Beta Human Chorionic Gonadotropin", "mIU/mL", "< 5.00 (Non-Pregnant)", 0.0, 5.00, 0.0, 5.00, null, null, null, null),
        new("Immunoassay & Endocrinology", "TROP_I", "Cardiac Troponin I", "ng/mL", "< 0.04 (Normal)", 0.0, 0.04, 0.0, 0.04, 0.0, 0.04, null, 0.10),
    ];

    public static (AnalyteFlag Flag, string? AlertNote) Evaluate(string analyteCode, string valueStr, string gender, int? patientAge = null)
    {
        var spec = Array.Find(Catalog, c => string.Equals(c.AnalyteCode, analyteCode, StringComparison.OrdinalIgnoreCase));
        if (spec == null)
            return (AnalyteFlag.Normal, null);

        var trimmedVal = valueStr.Trim();

        // 1. Qualitative Evaluation
        if (spec.QualitativeNormal != null || spec.QualitativeCritical != null)
        {
            // Check Normal first with exact equality
            if (spec.QualitativeNormal != null && spec.QualitativeNormal.Any(n => string.Equals(n, trimmedVal, StringComparison.OrdinalIgnoreCase)))
            {
                return (AnalyteFlag.Normal, null);
            }

            // Check Critical
            if (spec.QualitativeCritical != null && spec.QualitativeCritical.Any(c => 
                string.Equals(c, trimmedVal, StringComparison.OrdinalIgnoreCase) || 
                (!trimmedVal.StartsWith("Non", StringComparison.OrdinalIgnoreCase) && trimmedVal.Contains(c, StringComparison.OrdinalIgnoreCase))))
            {
                return (AnalyteFlag.Critical, $"CRITICAL PANIC: Value '{trimmedVal}' indicates positive/abnormal finding. Requires immediate clinical notification.");
            }

            // If qualitative but not in normal list
            return (AnalyteFlag.High, $"Abnormal finding: '{trimmedVal}' outside expected normal interval.");
        }

        // 2. Quantitative / Numeric Evaluation
        if (!double.TryParse(trimmedVal, out var val))
            return (AnalyteFlag.Normal, null);

        var isPediatric = patientAge.HasValue && patientAge.Value < 18;
        var isFemale = string.Equals(gender, "Female", StringComparison.OrdinalIgnoreCase);

        double? min;
        double? max;

        if (isPediatric && (spec.PediatricMin.HasValue || spec.PediatricMax.HasValue))
        {
            min = spec.PediatricMin ?? (isFemale ? spec.FemaleMin : spec.MaleMin);
            max = spec.PediatricMax ?? (isFemale ? spec.FemaleMax : spec.MaleMax);
        }
        else
        {
            min = isFemale ? (spec.FemaleMin ?? spec.MaleMin) : (spec.MaleMin ?? spec.FemaleMin);
            max = isFemale ? (spec.FemaleMax ?? spec.MaleMax) : (spec.MaleMax ?? spec.FemaleMax);
        }

        // Critical / Panic Threshold Check
        if (spec.CriticalLow.HasValue && val <= spec.CriticalLow.Value)
            return (AnalyteFlag.Critical, $"CRITICAL PANIC: Value {val} {spec.Unit} is dangerously low (Critical threshold: <= {spec.CriticalLow}). Requires immediate physician alert.");

        if (spec.CriticalHigh.HasValue && val >= spec.CriticalHigh.Value)
            return (AnalyteFlag.Critical, $"CRITICAL PANIC: Value {val} {spec.Unit} is dangerously elevated (Critical threshold: >= {spec.CriticalHigh}). Requires immediate physician alert.");

        // Low / High Reference Interval Check
        if (min.HasValue && val < min.Value)
            return (AnalyteFlag.Low, $"Below normal reference interval ({min.Value} - {max?.ToString() ?? "N/A"} {spec.Unit}).");

        if (max.HasValue && val > max.Value)
            return (AnalyteFlag.High, $"Above normal reference interval ({min?.ToString() ?? "0"} - {max.Value} {spec.Unit}).");

        return (AnalyteFlag.Normal, null);
    }
}
