using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public class CreateAdminRoleCommandValidator : AbstractValidator<CreateAdminRoleCommand>
{
    public CreateAdminRoleCommandValidator()
    {
        RuleFor(v => v.Name)
            .NotEmpty().WithMessage("Role name is required.")
            .MaximumLength(50).WithMessage("Role name must not exceed 50 characters.");

        RuleFor(v => v.Description)
            .NotEmpty().WithMessage("Description is required.")
            .MaximumLength(250).WithMessage("Description must not exceed 250 characters.");

        RuleFor(v => v.Permissions)
            .NotEmpty().WithMessage("At least one permission is required.");
    }
}
