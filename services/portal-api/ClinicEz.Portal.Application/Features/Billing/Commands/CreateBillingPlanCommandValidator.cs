using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public class CreateBillingPlanCommandValidator : AbstractValidator<CreateBillingPlanCommand>
{
    public CreateBillingPlanCommandValidator()
    {
        RuleFor(v => v.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(100).WithMessage("Name must not exceed 100 characters.");

        RuleFor(v => v.Slug)
            .NotEmpty().WithMessage("Slug is required.")
            .MaximumLength(50).WithMessage("Slug must not exceed 50 characters.")
            .Matches("^[a-z0-9-]+$").WithMessage("Slug can only contain lowercase letters, numbers, and hyphens.");

        RuleFor(v => v.Description)
            .NotEmpty().WithMessage("Description is required.")
            .MaximumLength(500).WithMessage("Description must not exceed 500 characters.");

        RuleFor(v => v.PriceMonthly)
            .GreaterThanOrEqualTo(0).WithMessage("Monthly price cannot be negative.");

        RuleFor(v => v.PriceAnnually)
            .GreaterThanOrEqualTo(0).WithMessage("Annual price cannot be negative.");

        RuleFor(v => v.Features)
            .NotNull().WithMessage("Features list cannot be null.");
    }
}
