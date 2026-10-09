using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
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

        RuleFor(v => v.DeploymentMode).IsInEnum();

        When(v => v.DeploymentMode == FacilityDeploymentMode.OnPremise, () =>
        {
            RuleFor(v => v.ConsoleBaseUrl).Must(ConsoleBaseUrlRule.IsValid)
                .WithMessage("On-premise facilities need an https:// console address (no credentials, query or fragment).");
        });

        When(v => v.DeploymentMode == FacilityDeploymentMode.SharedCloud, () =>
        {
            RuleFor(v => v.ConsoleBaseUrl).Must(string.IsNullOrWhiteSpace)
                .WithMessage("A custom console address applies to on-premise facilities only.");
        });
    }
}
