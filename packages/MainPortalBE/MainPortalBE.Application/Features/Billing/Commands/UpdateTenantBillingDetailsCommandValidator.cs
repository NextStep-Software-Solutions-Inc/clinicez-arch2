using FluentValidation;

namespace MainPortalBE.Application.Features.Billing.Commands;

public class UpdateTenantBillingDetailsCommandValidator : AbstractValidator<UpdateTenantBillingDetailsCommand>
{
    public UpdateTenantBillingDetailsCommandValidator()
    {
        RuleFor(v => v.TenantId)
            .NotEmpty().WithMessage("Tenant ID is required.");

        RuleFor(v => v.Country)
            .NotEmpty().WithMessage("Country is required.")
            .Length(2).WithMessage("Country must be a 2-letter ISO code.");

        RuleFor(v => v.City)
            .NotEmpty().WithMessage("City is required.");
    }
}
