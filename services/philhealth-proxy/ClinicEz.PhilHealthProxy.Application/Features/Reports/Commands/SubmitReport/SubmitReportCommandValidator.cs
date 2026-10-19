using FluentValidation;

namespace ClinicEz.PhilHealthProxy.Application.Features.Reports.Commands.SubmitReport;

public sealed class SubmitReportCommandValidator : AbstractValidator<SubmitReportCommand>
{
    // PKA v1.1, Module 3-B: pTransmittalID format is R + AccreditationNo(9) + yyyymm(6) + seq(5) = 21 chars.
    private const string TransmittalIdPattern = @"^R[A-Z0-9]{9}\d{11}$";

    public SubmitReportCommandValidator()
    {
        RuleFor(x => x.TransmittalId)
            .NotEmpty()
                .WithMessage("Transmittal ID is required.")
            .Length(21)
                .WithMessage("Transmittal ID must be exactly 21 characters.")
            .Matches(TransmittalIdPattern)
                .WithMessage("Transmittal ID must follow the format: R + AccreditationNo(9) + yyyymm(6) + SequenceNo(5). Example: RH9000000120230100001.");

        RuleFor(x => x.Report)
            .NotEmpty()
                .WithMessage("Report content is required.");

        // PKA v1.1, Module 3-B: pReportTagging must be '1' or '2'.
        RuleFor(x => x.ReportTagging)
            .NotEmpty()
                .WithMessage("Report tagging is required.")
            .Must(t => t is "1" or "2")
                .WithMessage("Report tagging must be '1' (first encounter) or '2' (full encounter).");
    }
}
