using System.Linq;
using ClinicEz.Portal.Application.Features.Entitlements;
using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public class UpdateBillingPlanCommandValidator : AbstractValidator<UpdateBillingPlanCommand>
{
    public UpdateBillingPlanCommandValidator()
    {
        RuleFor(v => v.Id)
            .NotEmpty().WithMessage("Id is required.");

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

        RuleFor(v => v.Rank)
            .GreaterThanOrEqualTo(1).WithMessage("Rank must be at least 1.");

        RuleFor(v => v.PriceMonthly)
            .GreaterThanOrEqualTo(0).WithMessage("Monthly price cannot be negative.");

        RuleFor(v => v.PriceAnnually)
            .GreaterThanOrEqualTo(0).WithMessage("Annual price cannot be negative.");

        RuleFor(v => v.Features)
            .NotNull().WithMessage("Features list cannot be null.");

        RuleFor(v => v.Limits)
            .NotNull().WithMessage("Limits dictionary cannot be null.")
            .Must(limits => limits.Keys.All(k => EntitlementKeys.Limits.Contains(k)))
            .WithMessage("One or more limit keys are invalid. Allowed keys: " + string.Join(", ", EntitlementKeys.Limits))
            .Must(limits => limits.Values.All(v => v >= 0 || v == -1))
            .WithMessage("Limit values must be greater than or equal to 0 (or -1 for unlimited).");

        RuleFor(v => v.EnabledFeatures)
            .NotNull().WithMessage("Enabled features list cannot be null.")
            .Must(features => features.All(f => EntitlementKeys.Features.Contains(f)))
            .WithMessage("One or more feature keys are invalid. Allowed features: " + string.Join(", ", EntitlementKeys.Features));
    }
}
