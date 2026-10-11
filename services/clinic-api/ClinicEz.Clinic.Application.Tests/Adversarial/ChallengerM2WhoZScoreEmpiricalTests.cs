using System;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Test Suite for WHO Pediatric Z-Score Calculator (Milestone 2).
/// Adversarially stresses:
/// 1. Under-5 boundary conditions (0 months, 60 months, 61+ months, future DOBs, negative age).
/// 2. Posture adjustments (+0.7 cm standing &lt; 24m, -0.7 cm recumbent &gt;= 24m, and resulting negative lengths).
/// 3. Statutory catalog typo handling (lib_zscore.json line 1386: code "boys-0-23/0285" with weight "7..9").
/// 4. Extreme and missing inputs (zero/negative height/weight, massive obesity, extreme stunting, catalog clamping).
/// 5. Gender normalization and boundary robustness.
/// </summary>
public class ChallengerM2WhoZScoreEmpiricalTests
{
    private readonly WhoZScoreCalculator _calculator;

    public ChallengerM2WhoZScoreEmpiricalTests()
    {
        _calculator = new WhoZScoreCalculator();
    }

    #region 1. Under-5 Boundary Conditions

    [Fact]
    public void Under5Boundary_ZeroMonths_DayOfBirth_EvaluatesSuccessfully()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = today; // 0 months old newborn

        // Newborn male: 50.0 cm length (recumbent), 3.3 kg
        var resultMale = _calculator.Calculate(dob, "Male", 50.0m, 3.3m, isMeasuredRecumbent: true, assessmentDate: today);

        resultMale.Should().NotBeNull();
        resultMale!.AgeInMonths.Should().Be(0);
        resultMale.AdjustedLengthHeightCm.Should().Be(50.0m);
        resultMale.PhilHealthZScoreCategory.Should().Be("Normal");
        resultMale.PhilHealthZScoreCode.Should().NotBeNullOrWhiteSpace();
        resultMale.WeightForAgeZScore.Should().NotBeNull();
        resultMale.HeightForAgeZScore.Should().NotBeNull();
        resultMale.WeightForHeightZScore.Should().NotBeNull();

        // Newborn female: 49.0 cm length (recumbent), 3.2 kg
        var resultFemale = _calculator.Calculate(dob, "Female", 49.0m, 3.2m, isMeasuredRecumbent: true, assessmentDate: today);

        resultFemale.Should().NotBeNull();
        resultFemale!.AgeInMonths.Should().Be(0);
        resultFemale.AdjustedLengthHeightCm.Should().Be(49.0m);
        resultFemale.PhilHealthZScoreCategory.Should().Be("Normal");
    }

    [Fact]
    public void Under5Boundary_Exactly60Months_FifthBirthday_EvaluatesSuccessfully()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2021, 10, 11); // Exactly 60 months (5 years exact)

        var result = _calculator.Calculate(dob, "Male", 110.0m, 18.3m, isMeasuredRecumbent: false, assessmentDate: today);

        result.Should().NotBeNull();
        result!.AgeInMonths.Should().Be(60);
        result.AdjustedLengthHeightCm.Should().Be(110.0m);
        result.PhilHealthZScoreCategory.Should().NotBeNullOrWhiteSpace();
        result.PhilHealthZScoreCode.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void Under5Boundary_60MonthsAnd29Days_EvaluatesSuccessfully()
    {
        var today = new DateOnly(2026, 10, 30);
        var dob = new DateOnly(2021, 10, 1); // 60 months and 29 days

        var result = _calculator.Calculate(dob, "Female", 109.0m, 18.0m, isMeasuredRecumbent: false, assessmentDate: today);

        result.Should().NotBeNull();
        result!.AgeInMonths.Should().Be(60);
    }

    [Fact]
    public void Under5Boundary_Exactly61Months_ReturnsNullWithoutThrowing()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2021, 9, 11); // Exactly 61 months (5 years + 1 month)

        var result = _calculator.Calculate(dob, "Male", 112.0m, 19.0m, isMeasuredRecumbent: false, assessmentDate: today);

        result.Should().BeNull("statutory dataset boundary is strictly Under-5 (0 to 60 months)");
    }

    [Theory]
    [InlineData(62)]
    [InlineData(72)]
    [InlineData(120)]
    [InlineData(216)]
    public void Under5Boundary_OlderChildrenAndAdolescents_ReturnsNullWithoutThrowing(int monthsAgo)
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = today.AddMonths(-monthsAgo);

        var result = _calculator.Calculate(dob, "Female", 120.0m, 22.0m, isMeasuredRecumbent: false, assessmentDate: today);

        result.Should().BeNull();
    }

    [Theory]
    [InlineData(1)]   // Tomorrow
    [InlineData(30)]  // Next month
    [InlineData(365)] // Next year
    public void Boundary_FutureBirthDates_ReturnsNullWithoutThrowing(int daysInFuture)
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = today.AddDays(daysInFuture);

        var result = _calculator.Calculate(dob, "Male", 50.0m, 3.5m, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().BeNull();
    }

    #endregion

    #region 2. Posture Adjustments

    [Fact]
    public void PostureAdjustment_Under24Months_StandingLength_AddsPointSevenCm()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2025, 10, 11); // 12 months (< 24m)

        // Measured standing (not recumbent) should have +0.7cm applied
        // 74.3 cm measured standing + 0.7 cm = 75.0 cm adjusted
        var evalStanding = _calculator.Calculate(dob, "Male", 74.3m, 9.8m, isMeasuredRecumbent: false, assessmentDate: today);

        // Measured recumbent at 75.0 cm directly
        var evalRecumbent = _calculator.Calculate(dob, "Male", 75.0m, 9.8m, isMeasuredRecumbent: true, assessmentDate: today);

        evalStanding.Should().NotBeNull();
        evalRecumbent.Should().NotBeNull();

        evalStanding!.AdjustedLengthHeightCm.Should().Be(75.0m);
        evalRecumbent!.AdjustedLengthHeightCm.Should().Be(75.0m);

        // Both should map to the exact same catalog code and category
        evalStanding.PhilHealthZScoreCode.Should().Be(evalRecumbent.PhilHealthZScoreCode);
        evalStanding.PhilHealthZScoreCategory.Should().Be(evalRecumbent.PhilHealthZScoreCategory);
        evalStanding.WeightForHeightZScore.Should().Be(evalRecumbent.WeightForHeightZScore);
    }

    [Fact]
    public void PostureAdjustment_Under24Months_Recumbent_LeavesUnadjusted()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2025, 4, 11); // 18 months (< 24m)

        var eval = _calculator.Calculate(dob, "Female", 82.0m, 10.5m, isMeasuredRecumbent: true, assessmentDate: today);

        eval.Should().NotBeNull();
        eval!.AdjustedLengthHeightCm.Should().Be(82.0m);
    }

    [Fact]
    public void PostureAdjustment_AtOrOver24Months_RecumbentHeight_SubtractsPointSevenCm()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2023, 10, 11); // 36 months (>= 24m)

        // Measured recumbent should have -0.7cm applied
        // 95.7 cm measured recumbent - 0.7 cm = 95.0 cm adjusted
        var evalRecumbent = _calculator.Calculate(dob, "Female", 95.7m, 14.2m, isMeasuredRecumbent: true, assessmentDate: today);

        // Measured standing at 95.0 cm directly
        var evalStanding = _calculator.Calculate(dob, "Female", 95.0m, 14.2m, isMeasuredRecumbent: false, assessmentDate: today);

        evalRecumbent.Should().NotBeNull();
        evalStanding.Should().NotBeNull();

        evalRecumbent!.AdjustedLengthHeightCm.Should().Be(95.0m);
        evalStanding!.AdjustedLengthHeightCm.Should().Be(95.0m);

        // Both should map to identical catalog code and category
        evalRecumbent.PhilHealthZScoreCode.Should().Be(evalStanding.PhilHealthZScoreCode);
        evalRecumbent.PhilHealthZScoreCategory.Should().Be(evalStanding.PhilHealthZScoreCategory);
        evalRecumbent.WeightForHeightZScore.Should().Be(evalStanding.WeightForHeightZScore);
    }

    [Fact]
    public void PostureAdjustment_AtOrOver24Months_Standing_LeavesUnadjusted()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2022, 10, 11); // 48 months (>= 24m)

        var eval = _calculator.Calculate(dob, "Male", 102.5m, 16.0m, isMeasuredRecumbent: false, assessmentDate: today);

        eval.Should().NotBeNull();
        eval!.AdjustedLengthHeightCm.Should().Be(102.5m);
    }

    [Fact]
    public void PostureAdjustment_RecumbentOver24Months_ResultingInNegativeOrZeroLength_ReturnsNullWithoutThrowing()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2023, 10, 11); // 36 months

        // Extreme edge case: measured recumbent height 0.6 cm -> 0.6 - 0.7 = -0.1 cm
        var eval = _calculator.Calculate(dob, "Male", 0.6m, 10.0m, isMeasuredRecumbent: true, assessmentDate: today);

        eval.Should().BeNull();
    }

    #endregion

    #region 3. Statutory Catalog Typo Handling (lib_zscore.json Line 1386)

    [Fact]
    public void CatalogTypo_Line1386_BoyLength62Point5_DefensivelySanitizesDoubleDot7DotDot9()
    {
        // lib_zscore.json line 1386:
        // {"code":"boys-0-23/0285","description":"Normal","isActive":true,"attributes":{"sex":"M","ageMonths":"0-23","length":"62.5","weight":"7..9","resultCode":"+2SD"}}
        // At length 62.5 cm for male age 0-23 months, this specific entry defines the +2SD upper boundary for Normal!
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2026, 4, 11); // 6 months old male (< 24m)

        // Case A: Exactly 7.9 kg (the value in the typo "7..9")
        // Since +2SD is 7.9 kg, weight <= 7.9 kg must evaluate to "Normal" with code "boys-0-23/0285"
        var evalNormal = _calculator.Calculate(dob, "Male", 62.5m, 7.9m, isMeasuredRecumbent: true, assessmentDate: today);

        evalNormal.Should().NotBeNull();
        evalNormal!.PhilHealthZScoreCategory.Should().Be("Normal");
        evalNormal.PhilHealthZScoreCode.Should().Be("boys-0-23/0285");
        evalNormal.WeightForHeightZScore.Should().NotBeNull();

        // Case B: 8.0 kg (crosses above +2SD, where > +2SD is code "boys-0-23/0286" with weight "8")
        var evalOverweight = _calculator.Calculate(dob, "Male", 62.5m, 8.0m, isMeasuredRecumbent: true, assessmentDate: today);

        evalOverweight.Should().NotBeNull();
        evalOverweight!.PhilHealthZScoreCategory.Should().Be("Overweight");
        evalOverweight.PhilHealthZScoreCode.Should().Be("boys-0-23/0287");

        // Case C: 6.5 kg (well within normal range for length 62.5 cm, median ~6.8 kg)
        var evalMidNormal = _calculator.Calculate(dob, "Male", 62.5m, 6.5m, isMeasuredRecumbent: true, assessmentDate: today);

        evalMidNormal.Should().NotBeNull();
        evalMidNormal!.PhilHealthZScoreCategory.Should().Be("Normal");
    }

    #endregion

    #region 4. Extreme and Missing Inputs

    [Theory]
    [InlineData(0, 10)]
    [InlineData(-10, 10)]
    [InlineData(75, 0)]
    [InlineData(75, -5)]
    [InlineData(0, 0)]
    [InlineData(-50, -10)]
    public void ExtremeInputs_ZeroOrNegativeDimensions_ReturnsNullWithoutThrowing(decimal length, decimal weight)
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2025, 10, 11); // 12 months

        var result = _calculator.Calculate(dob, "Male", length, weight, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().BeNull();
    }

    [Fact]
    public void ExtremeInputs_MassiveObesityWeight_EvaluatesObeseWithoutOverflow()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2026, 4, 11); // 6 months

        // 150 kg infant
        var result = _calculator.Calculate(dob, "Male", 65.0m, 150.0m, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().NotBeNull();
        result!.PhilHealthZScoreCategory.Should().Be("Obese");
        result.WeightForHeightZScore.Should().BeGreaterThan(5.0m);
    }

    [Fact]
    public void ExtremeInputs_SevereWastingWeight_EvaluatesSeverelyWastedWithoutUnderflow()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2026, 4, 11); // 6 months

        // 0.5 kg infant (extreme starvation/wasting)
        var result = _calculator.Calculate(dob, "Male", 65.0m, 0.5m, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().NotBeNull();
        result!.PhilHealthZScoreCategory.Should().Be("Severely Wasted");
    }

    [Fact]
    public void ExtremeInputs_ExtremeTallLength_ClampsSafelyToCatalogMax()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2025, 10, 11); // 12 months (< 24m)

        // 250 cm length for 12-month infant (catalog max is 110 cm for 0-23m cohort)
        var result = _calculator.Calculate(dob, "Male", 250.0m, 15.0m, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().NotBeNull();
        result!.AdjustedLengthHeightCm.Should().Be(110.0m, "must clamp to 0-23 cohort ceiling (110.0 cm)");
    }

    [Fact]
    public void ExtremeInputs_ExtremeShortLength_ClampsSafelyToCatalogMin()
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2025, 10, 11); // 12 months (< 24m)

        // 10 cm length for 12-month infant (catalog min is 45.0 cm for 0-23m cohort)
        var result = _calculator.Calculate(dob, "Male", 10.0m, 8.0m, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().NotBeNull();
        result!.AdjustedLengthHeightCm.Should().Be(45.0m, "must clamp to 0-23 cohort floor (45.0 cm)");
    }

    #endregion

    #region 5. Gender Normalization Robustness

    [Theory]
    [InlineData("Female")]
    [InlineData("female")]
    [InlineData("F")]
    [InlineData("f")]
    [InlineData("FEMALE")]
    public void GenderNormalization_FemaleVariations_AllEvaluatedAsFemale(string gender)
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2025, 10, 11); // 12 months

        var result = _calculator.Calculate(dob, gender, 74.0m, 8.9m, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().NotBeNull();
        result!.Interpretation.Should().Contain("F");
    }

    [Theory]
    [InlineData("Male")]
    [InlineData("male")]
    [InlineData("M")]
    [InlineData("m")]
    [InlineData("MALE")]
    [InlineData("Unknown")] // Falls back safely to M
    public void GenderNormalization_MaleAndFallbackVariations_AllEvaluatedAsMale(string gender)
    {
        var today = new DateOnly(2026, 10, 11);
        var dob = new DateOnly(2025, 10, 11); // 12 months

        var result = _calculator.Calculate(dob, gender, 75.7m, 9.6m, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().NotBeNull();
        result!.Interpretation.Should().Contain("M");
    }

    #endregion
}
