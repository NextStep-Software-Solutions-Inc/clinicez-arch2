using FluentValidation;

namespace ClinicEz.PhilHealthProxy.Application.Features.Members.Queries.IsMemberDependentRegistered;

public sealed class IsMemberDependentRegisteredQueryValidator
    : AbstractValidator<IsMemberDependentRegisteredQuery>
{
    public IsMemberDependentRegisteredQueryValidator()
    {
        // PKA v1.1, Module 2-A: PIN is a 12-character number (String(12)).
        RuleFor(x => x.Pin)
            .NotEmpty()
                .WithMessage("PhilHealth Identification Number (PIN) is required.")
            .MaximumLength(12)
                .WithMessage("PIN must not exceed 12 characters.");

        // PKA v1.1, Module 2-A: pType is either 'MM' (Member) or 'DD' (Dependent).
        RuleFor(x => x.Type)
            .NotEmpty()
                .WithMessage("Member type is required.")
            .Must(t => t is "MM" or "DD")
                .WithMessage("Member type must be 'MM' for Member or 'DD' for Dependent.");
    }
}
