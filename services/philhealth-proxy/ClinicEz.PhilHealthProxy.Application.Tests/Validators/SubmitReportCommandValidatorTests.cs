using FluentValidation.TestHelper;
using ClinicEz.PhilHealthProxy.Application.Features.Reports.Commands.SubmitReport;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Validators;

public sealed class SubmitReportCommandValidatorTests
{
    private readonly SubmitReportCommandValidator _sut = new();

    // Valid transmittal ID: R + 9-char accreditation + 6-digit yyyymm + 5-digit seq = 21 chars
    private const string ValidTransmittalId = "RH9000000120230100001";

    [Theory]
    [InlineData("1")]
    [InlineData("2")]
    public void Valid_command_passes(string tagging)
    {
        var command = new SubmitReportCommand
        {
            TransmittalId = ValidTransmittalId,
            Report = "<xml/>",
            ReportTagging = tagging
        };

        _sut.TestValidate(command).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("")]
    public void Empty_TransmittalId_fails(string transmittalId)
    {
        var command = new SubmitReportCommand
        {
            TransmittalId = transmittalId,
            Report = "<xml/>",
            ReportTagging = "1"
        };

        _sut.TestValidate(command)
            .ShouldHaveValidationErrorFor(x => x.TransmittalId)
            .WithErrorMessage("Transmittal ID is required.");
    }

    [Theory]
    [InlineData("TX-001")]          // wrong format
    [InlineData("RH9000000120230100001X")] // 22 chars
    [InlineData("rH9000000120230100001")] // lowercase r
    public void Invalid_TransmittalId_format_fails(string transmittalId)
    {
        var command = new SubmitReportCommand
        {
            TransmittalId = transmittalId,
            Report = "<xml/>",
            ReportTagging = "1"
        };

        _sut.TestValidate(command)
            .ShouldHaveValidationErrorFor(x => x.TransmittalId);
    }

    [Theory]
    [InlineData("")]
    public void Empty_Report_fails(string report)
    {
        var command = new SubmitReportCommand
        {
            TransmittalId = ValidTransmittalId,
            Report = report,
            ReportTagging = "1"
        };

        _sut.TestValidate(command)
            .ShouldHaveValidationErrorFor(x => x.Report)
            .WithErrorMessage("Report content is required.");
    }

    [Theory]
    [InlineData("")]
    public void Empty_ReportTagging_fails(string tagging)
    {
        var command = new SubmitReportCommand
        {
            TransmittalId = ValidTransmittalId,
            Report = "<xml/>",
            ReportTagging = tagging
        };

        _sut.TestValidate(command)
            .ShouldHaveValidationErrorFor(x => x.ReportTagging)
            .WithErrorMessage("Report tagging is required.");
    }

    [Theory]
    [InlineData("0")]
    [InlineData("3")]
    [InlineData("TAG-001")]
    public void Invalid_ReportTagging_fails(string tagging)
    {
        var command = new SubmitReportCommand
        {
            TransmittalId = ValidTransmittalId,
            Report = "<xml/>",
            ReportTagging = tagging
        };

        _sut.TestValidate(command)
            .ShouldHaveValidationErrorFor(x => x.ReportTagging)
            .WithErrorMessage("Report tagging must be '1' (first encounter) or '2' (full encounter).");
    }
}
