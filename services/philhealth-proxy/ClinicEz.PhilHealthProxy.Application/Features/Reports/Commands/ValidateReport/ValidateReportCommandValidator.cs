using FluentValidation;

namespace ClinicEz.PhilHealthProxy.Application.Features.Reports.Commands.ValidateReport;

public sealed class ValidateReportCommandValidator : AbstractValidator<ValidateReportCommand>
{
    public ValidateReportCommandValidator()
    {
        // PKA v1.1, Module 3-A: pReportTagging must be '1' (first encounter data)
        // or '2' (encounter data + consultations + diagnostics + medicines).
        RuleFor(x => x.ReportTagging)
            .NotEmpty()
                .WithMessage("Report tagging is required.")
            .Must(t => t is "1" or "2")
                .WithMessage("Report tagging must be '1' (first encounter) or '2' (full encounter).");

        RuleFor(x => x.Report)
            .NotEmpty()
                .WithMessage("Report content is required.");
    }
}
