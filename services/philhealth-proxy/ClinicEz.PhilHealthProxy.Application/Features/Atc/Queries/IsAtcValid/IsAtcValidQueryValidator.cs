using FluentValidation;

namespace ClinicEz.PhilHealthProxy.Application.Features.Atc.Queries.IsAtcValid;

public sealed class IsAtcValidQueryValidator : AbstractValidator<IsAtcValidQuery>
{
    private const string DateFormat = "yyyy-MM-dd";

    public IsAtcValidQueryValidator()
    {
        // PKA v1.1, Module 2-C: PIN is a 12-character number (String(12)).
        RuleFor(x => x.Pin)
            .NotEmpty()
                .WithMessage("PhilHealth Identification Number (PIN) is required.")
            .MaximumLength(12)
                .WithMessage("PIN must not exceed 12 characters.");

        // PKA v1.1, Module 2-C: ATC is a 12-character code (String(12)).
        RuleFor(x => x.Atc)
            .NotEmpty()
                .WithMessage("Authorization to Claim (ATC) code is required.")
            .MaximumLength(12)
                .WithMessage("ATC must not exceed 12 characters.");

        RuleFor(x => x.EffectivityDate)
            .NotEmpty()
                .WithMessage("Effectivity date is required.")
            .Matches(@"^\d{4}-\d{2}-\d{2}$")
                .WithMessage($"Effectivity date must be in {DateFormat} format.");
    }
}
