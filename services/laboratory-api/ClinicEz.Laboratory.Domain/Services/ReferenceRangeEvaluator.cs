using System;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Services;

public record AnalyteStandardSpec(
    string PanelName,
    string AnalyteCode,
    string AnalyteName,
    string Unit,
    string ReferenceInterval,
    double? MaleMin,
    double? MaleMax,
    double? FemaleMin,
    double? FemaleMax,
    double? CriticalLow,
    double? CriticalHigh
);

public static class ReferenceRangeEvaluator
{
    public static readonly AnalyteStandardSpec[] Catalog =
    [
        // Hematology (CBC)
        new("Complete Blood Count (CBC)", "HGB", "Hemoglobin", "g/dL", "M: 13.5-17.5 • F: 12.0-15.5", 13.5, 17.5, 12.0, 15.5, 7.0, 20.0),
        new("Complete Blood Count (CBC)", "HCT", "Hematocrit", "%", "M: 41.0-50.0 • F: 36.0-44.0", 41.0, 50.0, 36.0, 44.0, 21.0, 60.0),
        new("Complete Blood Count (CBC)", "WBC", "White Blood Cells", "x10^3/uL", "4.5 - 10.0", 4.5, 10.0, 4.5, 10.0, 2.0, 30.0),
        new("Complete Blood Count (CBC)", "PLT", "Platelets", "x10^3/uL", "150 - 450", 150.0, 450.0, 150.0, 450.0, 50.0, 1000.0),

        // Clinical Chemistry
        new("Clinical Chemistry", "FBS", "Fasting Blood Sugar", "mg/dL", "70.0 - 99.0", 70.0, 99.0, 70.0, 99.0, 50.0, 400.0),
        new("Clinical Chemistry", "CREA", "Serum Creatinine", "mg/dL", "M: 0.7-1.3 • F: 0.6-1.1", 0.7, 1.3, 0.6, 1.1, 0.3, 5.0),
        new("Clinical Chemistry", "BUN", "Blood Urea Nitrogen", "mg/dL", "7.0 - 20.0", 7.0, 20.0, 7.0, 20.0, 3.0, 60.0),
        new("Clinical Chemistry", "CHOL", "Total Cholesterol", "mg/dL", "< 200.0 (Desirable)", 0.0, 200.0, 0.0, 200.0, null, 350.0),
        new("Clinical Chemistry", "TRIG", "Triglycerides", "mg/dL", "< 150.0 (Normal)", 0.0, 150.0, 0.0, 150.0, null, 500.0),
        new("Clinical Chemistry", "HDL", "HDL Cholesterol", "mg/dL", "> 40.0 (Protective)", 40.0, 100.0, 40.0, 100.0, null, null),
        new("Clinical Chemistry", "LDL", "LDL Cholesterol", "mg/dL", "< 100.0 (Optimal)", 0.0, 100.0, 0.0, 100.0, null, 190.0),
    ];

    public static (AnalyteFlag Flag, string? AlertNote) Evaluate(string analyteCode, string valueStr, string gender)
    {
        var spec = Array.Find(Catalog, c => string.Equals(c.AnalyteCode, analyteCode, StringComparison.OrdinalIgnoreCase));
        if (spec == null)
            return (AnalyteFlag.Normal, null);

        if (!double.TryParse(valueStr, out var val))
            return (AnalyteFlag.Normal, null);

        var isFemale = string.Equals(gender, "Female", StringComparison.OrdinalIgnoreCase);
        var min = isFemale ? (spec.FemaleMin ?? spec.MaleMin) : (spec.MaleMin ?? spec.FemaleMin);
        var max = isFemale ? (spec.FemaleMax ?? spec.MaleMax) : (spec.MaleMax ?? spec.FemaleMax);

        // Check Critical / Panic
        if (spec.CriticalLow.HasValue && val <= spec.CriticalLow.Value)
            return (AnalyteFlag.Critical, "CRITICAL PANIC: Value is dangerously low. Requires immediate physician alert.");

        if (spec.CriticalHigh.HasValue && val >= spec.CriticalHigh.Value)
            return (AnalyteFlag.Critical, "CRITICAL PANIC: Value is dangerously elevated. Requires immediate physician alert.");

        // Check Low / High
        if (min.HasValue && val < min.Value)
            return (AnalyteFlag.Low, "Below normal reference interval.");

        if (max.HasValue && val > max.Value)
            return (AnalyteFlag.High, "Above normal reference interval.");

        return (AnalyteFlag.Normal, null);
    }
}
