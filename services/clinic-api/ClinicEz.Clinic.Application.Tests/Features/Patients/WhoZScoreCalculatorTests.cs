using System;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class WhoZScoreCalculatorTests
{
    private readonly WhoZScoreCalculator _calculator;

    public WhoZScoreCalculatorTests()
    {
        _calculator = new WhoZScoreCalculator();
    }

    [Fact]
    public void Calculate_ChildOver60Months_ReturnsNull()
    {
        // 61 months old (5 years + 1 month)
        var today = new DateOnly(2026, 10, 1);
        var dob = new DateOnly(2021, 9, 1); // 61 months

        var result = _calculator.Calculate(dob, "Male", 110m, 18m, assessmentDate: today);

        result.Should().BeNull("statutory dataset boundary is Under-5 (0 to 60 months)");
    }

    [Fact]
    public void Calculate_NegativeAge_ReturnsNull()
    {
        var today = new DateOnly(2026, 10, 1);
        var dob = new DateOnly(2026, 11, 1); // Future DOB

        var result = _calculator.Calculate(dob, "Female", 50m, 3.5m, assessmentDate: today);

        result.Should().BeNull();
    }

    [Fact]
    public void Calculate_ValidUnder5Boy_ReturnsEvaluationWithZScoresAndCategory()
    {
        // 12 months old boy, 75 cm length, 10 kg weight
        var today = new DateOnly(2026, 10, 1);
        var dob = new DateOnly(2025, 10, 1); // 12 months

        var result = _calculator.Calculate(dob, "Male", 75.0m, 10.0m, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().NotBeNull();
        result!.PhilHealthZScoreCategory.Should().NotBeNullOrWhiteSpace();
        result.PhilHealthZScoreCode.Should().NotBeNullOrWhiteSpace();
        result.WeightForHeightZScore.Should().NotBeNull();
        result.WeightForAgeZScore.Should().NotBeNull();
        result.HeightForAgeZScore.Should().NotBeNull();
    }

    [Fact]
    public void Calculate_BoyWithLengthTriggering7DotDot9CatalogEntry_SanitizesTypoGracefully()
    {
        // lib_zscore.json line 1386: code "boys-0-23/0285" length 71.0cm, weight "7..9"
        // At length 71.0cm (recumbent, under 24m), this entry is loaded and must parse clean
        var today = new DateOnly(2026, 10, 1);
        var dob = new DateOnly(2026, 1, 1); // 9 months boy

        var result = _calculator.Calculate(dob, "M", 71.0m, 8.0m, isMeasuredRecumbent: true, assessmentDate: today);

        result.Should().NotBeNull();
        result!.PhilHealthZScoreCategory.Should().Be("Normal");
    }

    [Fact]
    public void Calculate_PostureAdjustment_AffectsEffectiveLength()
    {
        var today = new DateOnly(2026, 10, 1);
        var dob = new DateOnly(2025, 10, 1); // 12 months old (< 24m)

        // Measured standing (not recumbent) should have +0.7cm posture adjustment applied
        var evalStanding = _calculator.Calculate(dob, "Male", 74.3m, 9.5m, isMeasuredRecumbent: false, assessmentDate: today);
        var evalRecumbent = _calculator.Calculate(dob, "Male", 75.0m, 9.5m, isMeasuredRecumbent: true, assessmentDate: today);

        evalStanding.Should().NotBeNull();
        evalRecumbent.Should().NotBeNull();
        // 74.3 + 0.7 = 75.0 cm, rounded to 75.0 cm => same catalog lookup bracket!
        evalStanding!.PhilHealthZScoreCode.Should().Be(evalRecumbent!.PhilHealthZScoreCode);
    }
}
