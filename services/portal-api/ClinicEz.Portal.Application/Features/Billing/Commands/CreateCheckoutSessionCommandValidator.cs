using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public class CreateCheckoutSessionCommandValidator : AbstractValidator<CreateCheckoutSessionCommand>
{
    public CreateCheckoutSessionCommandValidator()
    {
        RuleFor(v => v.TenantId)
            .NotEmpty().WithMessage("Tenant ID is required.");

        RuleFor(v => v.PlanId)
            .NotEmpty().WithMessage("Plan selection is required.");

        RuleFor(v => v.Country)
            .NotEmpty().WithMessage("Billing country is required.")
            .Length(2).WithMessage("Country must be a 2-letter ISO code.");
    }
}
