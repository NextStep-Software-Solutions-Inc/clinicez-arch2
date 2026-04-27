using FluentValidation.TestHelper;
using PhilHealthProxy.Application.Features.Atc.Queries.IsAtcValid;
using Xunit;

namespace PhilHealthProxy.Application.Tests.Validators;

public sealed class IsAtcValidQueryValidatorTests
{
    private readonly IsAtcValidQueryValidator _sut = new();

    [Fact]
    public void Valid_query_passes()
    {
        var query = new IsAtcValidQuery
        {
            Pin = "010000000001",
            Atc = "ATC00000001",
            EffectivityDate = "2025-06-01"
        };

        _sut.TestValidate(query).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("")]
    public void Empty_Pin_fails(string pin)
    {
        var query = new IsAtcValidQuery { Pin = pin, Atc = "ATC00000001", EffectivityDate = "2025-06-01" };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.Pin)
            .WithErrorMessage("PhilHealth Identification Number (PIN) is required.");
    }

    [Fact]
    public void Pin_exceeding_max_length_fails()
    {
        var query = new IsAtcValidQuery
        {
            Pin = new string('1', 13),
            Atc = "ATC00000001",
            EffectivityDate = "2025-06-01"
        };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.Pin)
            .WithErrorMessage("PIN must not exceed 12 characters.");
    }

    [Theory]
    [InlineData("")]
    public void Empty_Atc_fails(string atc)
    {
        var query = new IsAtcValidQuery { Pin = "010000000001", Atc = atc, EffectivityDate = "2025-06-01" };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.Atc)
            .WithErrorMessage("Authorization to Claim (ATC) code is required.");
    }

    [Fact]
    public void Atc_exceeding_max_length_fails()
    {
        var query = new IsAtcValidQuery
        {
            Pin = "010000000001",
            Atc = new string('A', 13),
            EffectivityDate = "2025-06-01"
        };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.Atc)
            .WithErrorMessage("ATC must not exceed 12 characters.");
    }

    [Theory]
    [InlineData("")]
    public void Empty_EffectivityDate_fails(string date)
    {
        var query = new IsAtcValidQuery { Pin = "010000000001", Atc = "ATC00000001", EffectivityDate = date };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.EffectivityDate)
            .WithErrorMessage("Effectivity date is required.");
    }

    [Theory]
    [InlineData("06/01/2025")]
    [InlineData("2025.06.01")]
    [InlineData("20250601")]
    public void Invalid_EffectivityDate_format_fails(string date)
    {
        var query = new IsAtcValidQuery { Pin = "010000000001", Atc = "ATC00000001", EffectivityDate = date };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.EffectivityDate)
            .WithErrorMessage("Effectivity date must be in yyyy-MM-dd format.");
    }
}
