using FluentValidation.TestHelper;
using ClinicEz.PhilHealthProxy.Application.Features.Registration.Queries.ExtractRegistrationList;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Validators;

public sealed class ExtractRegistrationListQueryValidatorTests
{
    private readonly ExtractRegistrationListQueryValidator _sut = new();

    [Fact]
    public void Valid_query_passes()
    {
        var query = new ExtractRegistrationListQuery { StartDate = "2025-01-01", EndDate = "2025-01-31" };

        _sut.TestValidate(query).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("")]
    public void Empty_StartDate_fails(string startDate)
    {
        var query = new ExtractRegistrationListQuery { StartDate = startDate, EndDate = "2025-01-31" };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.StartDate)
            .WithErrorMessage("Start date is required.");
    }

    [Theory]
    [InlineData("")]
    public void Empty_EndDate_fails(string endDate)
    {
        var query = new ExtractRegistrationListQuery { StartDate = "2025-01-01", EndDate = endDate };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.EndDate)
            .WithErrorMessage("End date is required.");
    }

    [Theory]
    [InlineData("01/01/2025")]
    [InlineData("20250101")]
    public void Invalid_date_format_fails(string date)
    {
        var query = new ExtractRegistrationListQuery { StartDate = date, EndDate = "2025-01-31" };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.StartDate)
            .WithErrorMessage("Start date must be in yyyy-MM-dd format.");
    }

    [Fact]
    public void EndDate_before_StartDate_fails()
    {
        var query = new ExtractRegistrationListQuery { StartDate = "2025-03-01", EndDate = "2025-01-01" };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor("DateRange");
    }

    [Fact]
    public void Same_StartDate_and_EndDate_passes()
    {
        var query = new ExtractRegistrationListQuery { StartDate = "2025-01-15", EndDate = "2025-01-15" };

        _sut.TestValidate(query).ShouldNotHaveAnyValidationErrors();
    }
}
