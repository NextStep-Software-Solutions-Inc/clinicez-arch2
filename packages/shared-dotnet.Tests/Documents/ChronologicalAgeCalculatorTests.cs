using System;
using ClinicEz.Shared.Documents.Common;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Documents;

public class ChronologicalAgeCalculatorTests
{
    [Fact]
    public void Calculate_AdultsAndChildren_Formats_Full_Components()
    {
        var birth = new DateOnly(1990, 1, 1);
        var reference = new DateOnly(2023, 11, 12); // 33 yrs, 10 mos, 1 wk, 4 days

        var result = ChronologicalAgeCalculator.FormatLongAge(birth, reference);

        result.Should().Be("33 yrs, 10 mos, 1 wk, 4 days");
    }

    [Fact]
    public void Calculate_Exact_Anniversary_Omits_Zero_Components()
    {
        var birth = new DateOnly(2000, 5, 15);
        var reference = new DateOnly(2026, 5, 15);

        var result = ChronologicalAgeCalculator.FormatLongAge(birth, reference);

        result.Should().Be("26 yrs");
    }

    [Fact]
    public void Calculate_Infants_Omits_Years()
    {
        var birth = new DateOnly(2026, 1, 1);
        var reference = new DateOnly(2026, 4, 19); // 3 mos, 2 wks, 4 days

        var result = ChronologicalAgeCalculator.FormatLongAge(birth, reference);

        result.Should().Be("3 mos, 2 wks, 4 days");
    }

    [Fact]
    public void Calculate_Newborns_Formats_Days_Only()
    {
        var birth = new DateOnly(2026, 10, 8);
        var reference = new DateOnly(2026, 10, 20); // 12 days

        var result = ChronologicalAgeCalculator.FormatLongAge(birth, reference);

        result.Should().Be("12 days");
    }

    [Fact]
    public void FormatLongAge_With_Fallback_Years_When_DateOfBirth_Null()
    {
        var result = ChronologicalAgeCalculator.FormatLongAge(null, null, fallbackYears: 28);

        result.Should().Be("28 yrs");
    }
}
