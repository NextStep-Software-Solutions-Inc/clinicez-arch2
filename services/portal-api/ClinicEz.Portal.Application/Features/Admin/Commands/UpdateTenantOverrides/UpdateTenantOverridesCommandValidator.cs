using System;
using System.Linq;
using ClinicEz.Portal.Application.Features.Entitlements;
using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Admin.Commands.UpdateTenantOverrides;

public class UpdateTenantOverridesCommandValidator : AbstractValidator<UpdateTenantOverridesCommand>
{
    public UpdateTenantOverridesCommandValidator()
    {
        RuleFor(x => x.TenantId)
            .NotEmpty().WithMessage("TenantId is required.");

        RuleFor(x => x.Limits)
            .Must(limits => limits == null || limits.Keys.All(k => EntitlementKeys.Limits.Contains(k)))
            .WithMessage("One or more limit keys are invalid. Allowed keys: " + string.Join(", ", EntitlementKeys.Limits))
            .Must(limits => limits == null || limits.Values.All(v => !v.HasValue || v.Value >= 0 || v.Value == -1))
            .WithMessage("Limit override values must be greater than or equal to 0 (or -1/null for unlimited).");

        RuleFor(x => x.Features)
            .Must(features => features == null || features.Keys.All(k => EntitlementKeys.Features.Contains(k)))
            .WithMessage("One or more feature keys are invalid. Allowed features: " + string.Join(", ", EntitlementKeys.Features));

        RuleFor(x => x.Reason)
            .MaximumLength(256).WithMessage("Reason cannot exceed 256 characters.");
    }
}
