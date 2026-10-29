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
            .MaximumLength(ReservedTenantSlugs.MaxSlugLength)
            .WithMessage($"Slug cannot exceed {ReservedTenantSlugs.MaxSlugLength} characters.")
            .Matches(ReservedTenantSlugs.DnsLabelPattern)
            .WithMessage("Slug can only contain lowercase letters, numbers, and hyphens.")
            .Must(slug => !ReservedTenantSlugs.IsReserved(slug))
            .WithMessage("This workplace URL slug is reserved by Clinic EZ. Please choose another.");

        RuleFor(x => x.TenantType)
            .NotEmpty().WithMessage("Tenant type is required.");
    }
}
