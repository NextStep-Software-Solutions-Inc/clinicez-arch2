using System;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public sealed record WhoZScoreEvaluation(
    int AgeInMonths,
    decimal AdjustedLengthHeightCm,
    decimal? WeightForAgeZScore,
    decimal? HeightForAgeZScore,
    decimal? WeightForHeightZScore,
    string? GrowthZScoreCategory,
    string? GrowthZScoreCode,
    string? Interpretation)
{
    public string? PhilHealthZScoreCategory => GrowthZScoreCategory;
    public string? PhilHealthZScoreCode => GrowthZScoreCode;
}

public interface IWhoZScoreCalculator
{
    /// <summary>
    /// Calculates WHO pediatric Z-scores and evaluates PhilHealth lib_zscore category.
    /// Returns null if patient age is outside the Under-5 cohort (&gt;= 61 months) or invalid inputs.
    /// </summary>
    WhoZScoreEvaluation? Calculate(
        DateOnly dateOfBirth,
        string sex,
        decimal lengthOrHeightCm,
        decimal weightKg,
        bool isMeasuredRecumbent = false,
        DateOnly? assessmentDate = null);
}
