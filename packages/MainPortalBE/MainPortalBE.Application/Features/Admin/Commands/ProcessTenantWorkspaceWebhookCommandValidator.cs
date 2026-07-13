using FluentValidation;

namespace MainPortalBE.Application.Features.Admin.Commands;

public class ProcessTenantWorkspaceWebhookCommandValidator : AbstractValidator<ProcessTenantWorkspaceWebhookCommand>
{
    public ProcessTenantWorkspaceWebhookCommandValidator()
    {
        RuleFor(v => v.Payload.TenantId)
            .NotEmpty().WithMessage("Tenant ID is required.");

        RuleFor(v => v.Payload.EventType)
            .NotEmpty().WithMessage("Event type is required.");

        RuleFor(v => v.Payload.ResourceId)
            .NotEmpty().WithMessage("Resource ID is required.");
    }
}
