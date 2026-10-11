using System;

namespace ClinicEz.Clinic.Domain.Services;

public enum PhilPenCvdRiskBand
{
    BandA_LessThan10Percent = 1,
    BandB_10ToUnder20Percent = 2,
    BandC_20ToUnder30Percent = 3,
    BandD_30ToUnder40Percent = 4,
    BandE_40PercentOrGreater = 5
}

public sealed record PhilPenSurveyInput(
    int AgeYears,
    string Gender,
    bool IsSmoker,
    int SystolicBp,
    int? DiastolicBp = null,
    bool HasDiabetes = false,
    decimal? FastingBloodSugarMgDl = null,
    decimal? TotalCholesterolMgDl = null,
    decimal? BodyMassIndex = null,
    bool HasAnginaOrPreviousStroke = false,
    bool RenalDiseasePresent = false
);

public sealed record PhilPenRiskResult(
    PhilPenCvdRiskBand RiskBand,
    decimal CalculatedScorePercent,
    bool UsedBmiFallback,
    bool CrisisOverrideApplied,
    string ManagementRecommendation
);

public static class PhilPenRiskScorer
{
    public static PhilPenRiskResult CalculateRiskScore(PhilPenSurveyInput input)
    {
        // 1. Crisis & Clinical Override Rules
        // Rule A: Hypertensive crisis (SBP >= 180 or DBP >= 110)
        if (input.SystolicBp >= 180 || (input.DiastolicBp.HasValue && input.DiastolicBp.Value >= 110))
        {
            return new PhilPenRiskResult(
                RiskBand: PhilPenCvdRiskBand.BandE_40PercentOrGreater,
                CalculatedScorePercent: 45.0m,
                UsedBmiFallback: false,
                CrisisOverrideApplied: true,
                ManagementRecommendation: "EMERGENCY: Hypertensive crisis. Immediate specialist referral and aggressive antihypertensive intervention required.");
        }

        // Rule B: Established CVD or persistent renal disease automatically elevates to highest risk (Band E)
        if (input.HasAnginaOrPreviousStroke || input.RenalDiseasePresent)
        {
            return new PhilPenRiskResult(
                RiskBand: PhilPenCvdRiskBand.BandE_40PercentOrGreater,
                CalculatedScorePercent: 40.0m,
                UsedBmiFallback: false,
                CrisisOverrideApplied: true,
                ManagementRecommendation: "Very High Risk: Established cardiovascular or renal disease. Intensive secondary prevention, high-intensity statin, and cardiology follow-up.");
        }

        // 2. WHO/ISH Point Scoring Framework
        int points = 0;

        // Age Scoring
        if (input.AgeYears >= 70) points += 6;
        else if (input.AgeYears >= 60) points += 5;
        else if (input.AgeYears >= 50) points += 3;
        else if (input.AgeYears >= 40) points += 2;

        // Gender & Smoking
        if (input.Gender.Equals("Male", StringComparison.OrdinalIgnoreCase)) points += 1;
        if (input.IsSmoker) points += 3;

        // Diabetes / Glycemia
        if (input.HasDiabetes || (input.FastingBloodSugarMgDl.HasValue && input.FastingBloodSugarMgDl.Value >= 126m))
        {
            points += 4;
        }

        // Systolic Blood Pressure
        if (input.SystolicBp >= 160) points += 5;
        else if (input.SystolicBp >= 140) points += 3;
        else if (input.SystolicBp >= 130) points += 1;

        // Cholesterol or BMI Fallback
        bool usedBmiFallback = false;
        if (input.TotalCholesterolMgDl.HasValue)
        {
            if (input.TotalCholesterolMgDl.Value >= 280m) points += 5;
            else if (input.TotalCholesterolMgDl.Value >= 240m) points += 4;
            else if (input.TotalCholesterolMgDl.Value >= 200m) points += 2;
        }
        else if (input.BodyMassIndex.HasValue)
        {
            usedBmiFallback = true;
            if (input.BodyMassIndex.Value >= 30m) points += 3;
            else if (input.BodyMassIndex.Value >= 25m) points += 1;
        }

        // 3. Map Points to Risk Bands
        var (riskBand, percent, rec) = points switch
        {
            >= 14 => (PhilPenCvdRiskBand.BandE_40PercentOrGreater, 41.0m, "Intensive pharmacotherapy, strict glycemic/BP control, and cardiology review."),
            >= 11 => (PhilPenCvdRiskBand.BandD_30ToUnder40Percent, 34.0m, "Combination pharmacotherapy (antihypertensive + statin) and close 1-month monitoring."),
            >= 8  => (PhilPenCvdRiskBand.BandC_20ToUnder30Percent, 24.5m, "Active drug therapy indicated; dietary and physical lifestyle modification."),
            >= 5  => (PhilPenCvdRiskBand.BandB_10ToUnder20Percent, 14.0m, "Lifestyle coaching, lipid monitoring, and follow-up in 3-6 months."),
            _     => (PhilPenCvdRiskBand.BandA_LessThan10Percent, 6.5m, "Low CVD risk: Routine primary care follow-up every 12 months.")
        };

        return new PhilPenRiskResult(
            RiskBand: riskBand,
            CalculatedScorePercent: percent,
            UsedBmiFallback: usedBmiFallback,
            CrisisOverrideApplied: false,
            ManagementRecommendation: rec);
    }
}
