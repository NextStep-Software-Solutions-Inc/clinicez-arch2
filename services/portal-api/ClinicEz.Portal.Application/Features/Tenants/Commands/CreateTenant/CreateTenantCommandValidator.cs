using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Tenants.Commands.CreateTenant;

public class CreateTenantCommandValidator : AbstractValidator<CreateTenantCommand>
{
    public CreateTenantCommandValidator()
    {
        RuleFor(x => x.OwnerId)
            .NotEmpty().WithMessage("Owner ID is required.");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Workplace / Entity name is required.")
            .MinimumLength(2).WithMessage("Name must be at least 2 characters.")
            .MaximumLength(100).WithMessage("Name cannot exceed 100 characters.");

        RuleFor(x => x.TenantSlug)
            .NotEmpty().WithMessage("Workplace URL slug is required.")
            .Matches(@"^[a-z0-9]+(?:-[a-z0-9]+)*$")
            .WithMessage("Slug can only contain lowercase letters, numbers, and hyphens.");

        RuleFor(x => x.TenantType)
            .NotEmpty().WithMessage("Tenant type is required.");
    }
}
