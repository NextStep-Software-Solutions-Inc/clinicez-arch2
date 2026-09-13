using FluentValidation.TestHelper;
using PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;
using Xunit;

namespace PhilHealthProxy.Application.Tests.Validators;

public sealed class CheckUploadStatusQueryValidatorTests
{
    private readonly CheckUploadStatusQueryValidator _sut = new();

    [Fact]
    public void Valid_query_passes()
    {
        var query = new CheckUploadStatusQuery
        {
            StartDate = "2025-01-01",
            EndDate = "2025-01-31"
        };

        _sut.TestValidate(query).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Empty_StartDate_fails(string? startDate)
    {
        var query = new CheckUploadStatusQuery { StartDate = startDate, EndDate = "2025-01-31" };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.StartDate)
            .WithErrorMessage("Start date is required.");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Empty_EndDate_fails(string? endDate)
    {
        var query = new CheckUploadStatusQuery { StartDate = "2025-01-01", EndDate = endDate };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.EndDate)
            .WithErrorMessage("End date is required.");
    }

    [Theory]
    [InlineData("01-01-2025")]
    [InlineData("2025/01/01")]
    [InlineData("20250101")]
    public void Invalid_StartDate_format_fails(string startDate)
    {
        var query = new CheckUploadStatusQuery { StartDate = startDate, EndDate = "2025-01-31" };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor(x => x.StartDate)
            .WithErrorMessage("Start date must be in yyyy-MM-dd format.");
    }

    [Fact]
    public void EndDate_before_StartDate_fails()
    {
        var query = new CheckUploadStatusQuery { StartDate = "2025-01-31", EndDate = "2025-01-01" };

        _sut.TestValidate(query)
            .ShouldHaveValidationErrorFor("DateRange");
    }
}
