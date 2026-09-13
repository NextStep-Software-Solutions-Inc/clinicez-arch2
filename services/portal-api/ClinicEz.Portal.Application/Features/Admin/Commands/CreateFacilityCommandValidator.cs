using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public class CreateFacilityCommandValidator : AbstractValidator<CreateFacilityCommand>
{
    public CreateFacilityCommandValidator()
    {
        RuleFor(v => v.TenantId)
            .NotEmpty().WithMessage("Tenant ID/slug is required.");

        RuleFor(v => v.Name)
            .NotEmpty().WithMessage("Facility name is required.")
            .MaximumLength(150).WithMessage("Facility name must not exceed 150 characters.");

        RuleFor(v => v.FacilityType)
            .IsInEnum().WithMessage("A valid facility type is required.");
    }
}
