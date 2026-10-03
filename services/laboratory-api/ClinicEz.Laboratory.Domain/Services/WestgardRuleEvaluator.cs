using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Services;

public record WestgardEvaluationResult(
    QcRunStatus Status,
    double ZScore,
    List<string> ViolatedRules,
    string SummaryMessage,
    string? RecommendedAction
);

public static class WestgardRuleEvaluator
{
    public static WestgardEvaluationResult Evaluate(
        double measuredValue,
        double targetMean,
        double targetSD,
        IReadOnlyList<double>? historicalZScores = null,
        double? peerLevelZScore = null)
    {
        if (targetSD <= 0)
        {
            throw new ArgumentException("Target Standard Deviation must be greater than zero.", nameof(targetSD));
        }

        var zScore = (measuredValue - targetMean) / targetSD;
        var violations = new List<string>();
        var status = QcRunStatus.Passed;
        string? recommendedAction = null;

        var history = historicalZScores ?? Array.Empty<double>();

        // 1. Check 1-3s (Random error - Rejection)
        if (Math.Abs(zScore) > 3.0)
        {
            violations.Add("1_3s");
            status = QcRunStatus.Rejected;
            recommendedAction = "Run rejected due to 1-3s violation (random error). Do not report patient results. Re-run control and inspect sample probe/bubble.";
        }

        // 2. Check 2-2s (Systematic error - Rejection)
        if (history.Count >= 1)
        {
            var prevZ = history[0];
            if ((zScore > 2.0 && prevZ > 2.0) || (zScore < -2.0 && prevZ < -2.0))
            {
                violations.Add("2_2s");
                status = QcRunStatus.Rejected;
                recommendedAction = "Run rejected due to 2-2s violation (systematic error). 2 consecutive runs exceeded 2SD on the same side. Recalibrate analyzer.";
            }
        }

        // 3. Check R-4s (Random error - Rejection)
        // Can be evaluated between consecutive controls or across two control levels within same run
        if (peerLevelZScore.HasValue)
        {
            if (Math.Abs(zScore - peerLevelZScore.Value) >= 4.0)
            {
                violations.Add("R_4s");
                status = QcRunStatus.Rejected;
                recommendedAction = "Run rejected due to R-4s violation across control levels. Difference between controls exceeds 4SD. Check reagent deterioration or optical drift.";
            }
        }
        else if (history.Count >= 1)
        {
            var prevZ = history[0];
            if ((zScore > 2.0 && prevZ < -2.0) || (zScore < -2.0 && prevZ > 2.0))
            {
                if (Math.Abs(zScore - prevZ) >= 4.0)
                {
                    violations.Add("R_4s");
                    status = QcRunStatus.Rejected;
                    recommendedAction = "Run rejected due to R-4s violation across consecutive runs (>4SD spread). Inspect calibration and optical cuvettes.";
                }
            }
        }

        // 4. Check 4-1s (Systematic error - Rejection / Warning)
        if (history.Count >= 3)
        {
            var last4 = new[] { zScore, history[0], history[1], history[2] };
            if (last4.All(z => z > 1.0) || last4.All(z => z < -1.0))
            {
                violations.Add("4_1s");
                if (status != QcRunStatus.Rejected)
                {
                    status = QcRunStatus.Rejected;
                    recommendedAction = "Run rejected due to 4-1s systematic drift. 4 consecutive controls exceed 1SD on the same side. Re-zero and perform sensor cleaning.";
                }
            }
        }

        // 5. Check 10-x (Systematic error - Warning / Investigation)
        if (history.Count >= 9)
        {
            var last10 = new List<double> { zScore };
            last10.AddRange(history.Take(9));
            if (last10.All(z => z > 0) || last10.All(z => z < 0))
            {
                violations.Add("10_x");
                if (status == QcRunStatus.Passed)
                {
                    status = QcRunStatus.Warning;
                    recommendedAction = "Warning: 10-x rule triggered. 10 consecutive controls fell on one side of the mean. Systematic shift suspected. Monitor closely.";
                }
            }
        }

        // 6. Check 1-2s (Warning - Screening rule)
        if (Math.Abs(zScore) > 2.0 && !violations.Contains("1_3s") && !violations.Contains("2_2s"))
        {
            violations.Add("1_2s");
            if (status == QcRunStatus.Passed)
            {
                status = QcRunStatus.Warning;
                recommendedAction = "Warning: 1-2s rule violated (>2SD from mean). Screening rule only. Inspect other control levels before rejecting run.";
            }
        }

        var summary = violations.Count > 0
            ? $"Violations detected: {string.Join(", ", violations)}. Z-score = {zScore:F2}."
            : $"QC Passed. Value is within statistical tolerance (Z-score = {zScore:F2}).";

        return new WestgardEvaluationResult(
            Status: status,
            ZScore: zScore,
            ViolatedRules: violations,
            SummaryMessage: summary,
            RecommendedAction: recommendedAction
        );
    }
}
