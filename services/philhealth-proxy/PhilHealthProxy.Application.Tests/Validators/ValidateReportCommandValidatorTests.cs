using FluentValidation.TestHelper;
using PhilHealthProxy.Application.Features.Reports.Commands.ValidateReport;
using Xunit;

namespace PhilHealthProxy.Application.Tests.Validators;

public sealed class ValidateReportCommandValidatorTests
{
    private readonly ValidateReportCommandValidator _sut = new();

    [Theory]
    [InlineData("1")]
    [InlineData("2")]
    public void Valid_command_passes(string tagging)
    {
        var command = new ValidateReportCommand { ReportTagging = tagging, Report = "<xml/>" };

        _sut.TestValidate(command).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("")]
    public void Empty_ReportTagging_fails(string tagging)
    {
        var command = new ValidateReportCommand { ReportTagging = tagging, Report = "<xml/>" };

        _sut.TestValidate(command)
            .ShouldHaveValidationErrorFor(x => x.ReportTagging)
            .WithErrorMessage("Report tagging is required.");
    }

    [Theory]
    [InlineData("0")]
    [InlineData("3")]
    [InlineData("TAG-001")]
    [InlineData("A")]
    public void Invalid_ReportTagging_fails(string tagging)
    {
        var command = new ValidateReportCommand { ReportTagging = tagging, Report = "<xml/>" };

        _sut.TestValidate(command)
            .ShouldHaveValidationErrorFor(x => x.ReportTagging)
            .WithErrorMessage("Report tagging must be '1' (first encounter) or '2' (full encounter).");
    }

    [Theory]
    [InlineData("")]
    public void Empty_Report_fails(string report)
    {
        var command = new ValidateReportCommand { ReportTagging = "1", Report = report };

        _sut.TestValidate(command)
            .ShouldHaveValidationErrorFor(x => x.Report)
            .WithErrorMessage("Report content is required.");
    }
}
