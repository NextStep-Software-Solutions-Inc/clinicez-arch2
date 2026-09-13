using FluentValidation.TestHelper;
using ClinicEz.PhilHealthProxy.Application.Features.Members.Queries.IsMemberDependentRegistered;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Validators;

public sealed class IsMemberDependentRegisteredQueryValidatorTests
{
    private readonly IsMemberDependentRegisteredQueryValidator _sut = new();

    [Theory]
    [InlineData("MM")]
    [InlineData("DD")]
    public void Valid_query_passes(string type)
    {
        var query = new IsMemberDependentRegisteredQuery { Pin = "010000000001", Type = type };

        _sut.TestValidate(query).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("")]
    public void Empty_Pin_fails(string pin)
    {
        var query = new IsMemberDependentRegisteredQuery { Pin = pin, Type = "MM" };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.Pin)
            .WithErrorMessage("PhilHealth Identification Number (PIN) is required.");
    }

    [Fact]
    public void Pin_exceeding_max_length_fails()
    {
        var query = new IsMemberDependentRegisteredQuery
        {
            Pin = new string('1', 13),
            Type = "MM"
        };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.Pin)
            .WithErrorMessage("PIN must not exceed 12 characters.");
    }

    [Theory]
    [InlineData("")]
    public void Empty_Type_fails(string type)
    {
        var query = new IsMemberDependentRegisteredQuery { Pin = "010000000001", Type = type };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.Type)
            .WithErrorMessage("Member type is required.");
    }

    [Theory]
    [InlineData("M")]
    [InlineData("D")]
    [InlineData("MEM")]
    [InlineData("DEP")]
    [InlineData("mm")]
    [InlineData("dd")]
    public void Invalid_Type_fails(string type)
    {
        var query = new IsMemberDependentRegisteredQuery { Pin = "010000000001", Type = type };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.Type)
            .WithErrorMessage("Member type must be 'MM' for Member or 'DD' for Dependent.");
    }
}
