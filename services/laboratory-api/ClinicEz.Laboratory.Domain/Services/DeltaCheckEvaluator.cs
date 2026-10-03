using System;

namespace ClinicEz.Laboratory.Domain.Services;

public record DeltaCheckThreshold(
    string AnalyteCode,
    double? MaxPercentShift,
    double? MaxAbsoluteShift,
    int MaxDaysWindow = 30
);

public record DeltaCheckEvaluationResult(
    bool IsAlert,
    string AnalyteCode,
    double CurrentValue,
    double PreviousValue,
    double PercentShift,
    double AbsoluteShift,
    DateTime PreviousDate,
    string Severity,
    string AlertMessage
);

public static class DeltaCheckEvaluator
{
    private static readonly DeltaCheckThreshold[] Thresholds =
    [
        new("CREA", MaxPercentShift: 50.0, MaxAbsoluteShift: 0.5, MaxDaysWindow: 30),
        new("HGB", MaxPercentShift: 20.0, MaxAbsoluteShift: 2.0, MaxDaysWindow: 14),
        new("HCT", MaxPercentShift: 20.0, MaxAbsoluteShift: 6.0, MaxDaysWindow: 14),
        new("PLT", MaxPercentShift: 40.0, MaxAbsoluteShift: 100.0, MaxDaysWindow: 14),
        new("WBC", MaxPercentShift: 50.0, MaxAbsoluteShift: 5.0, MaxDaysWindow: 14),
        new("K", MaxPercentShift: 20.0, MaxAbsoluteShift: 1.0, MaxDaysWindow: 14),
        new("NA", MaxPercentShift: 8.0, MaxAbsoluteShift: 8.0, MaxDaysWindow: 14),
        new("FBS", MaxPercentShift: 75.0, MaxAbsoluteShift: 100.0, MaxDaysWindow: 30),
        new("BUN", MaxPercentShift: 60.0, MaxAbsoluteShift: 15.0, MaxDaysWindow: 30),
        new("SGPT_ALT", MaxPercentShift: 80.0, MaxAbsoluteShift: 50.0, MaxDaysWindow: 30),
    ];

    public static DeltaCheckEvaluationResult? Evaluate(
        string analyteCode,
        string currentValueStr,
        string previousValueStr,
        DateTime previousDate,
        DateTime currentDate)
    {
        if (!double.TryParse(currentValueStr, out var currentVal) ||
            !double.TryParse(previousValueStr, out var prevVal))
        {
            return null;
        }

        if (prevVal == 0 && currentVal == 0)
            return null;

        var daysDiff = (currentDate - previousDate).TotalDays;
        var threshold = Array.Find(Thresholds, t => string.Equals(t.AnalyteCode, analyteCode, StringComparison.OrdinalIgnoreCase))
            ?? new DeltaCheckThreshold(analyteCode, MaxPercentShift: 60.0, MaxAbsoluteShift: null, MaxDaysWindow: 30);

        if (daysDiff > threshold.MaxDaysWindow)
            return null;

        var absShift = Math.Abs(currentVal - prevVal);
        var pctShift = prevVal != 0 ? (absShift / Math.Abs(prevVal)) * 100.0 : 100.0;

        bool alert = false;
        string reason = string.Empty;

        if (threshold.MaxPercentShift.HasValue && pctShift > threshold.MaxPercentShift.Value)
        {
            alert = true;
            reason = $"Shift of {pctShift:F1}% exceeds maximum allowable delta limit ({threshold.MaxPercentShift.Value:F1}%).";
        }
        else if (threshold.MaxAbsoluteShift.HasValue && absShift > threshold.MaxAbsoluteShift.Value)
        {
            alert = true;
            reason = $"Absolute shift of {absShift:F2} exceeds limit ({threshold.MaxAbsoluteShift.Value:F2}).";
        }

        if (!alert)
            return null;

        var direction = currentVal > prevVal ? "increased" : "dropped";
        var severity = (pctShift > (threshold.MaxPercentShift ?? 50.0) * 1.5) ? "Critical" : "Warning";
        var message = $"DELTA CHECK ALERT: {analyteCode} has {direction} from {prevVal:F1} to {currentVal:F1} ({pctShift:F1}%) within {Math.Max(1, (int)daysDiff)} day(s). {reason} Review for sample mix-up or acute clinical event before release.";

        return new DeltaCheckEvaluationResult(
            IsAlert: true,
            AnalyteCode: analyteCode,
            CurrentValue: currentVal,
            PreviousValue: prevVal,
            PercentShift: pctShift,
            AbsoluteShift: absShift,
            PreviousDate: previousDate,
            Severity: severity,
            AlertMessage: message
        );
    }
}
