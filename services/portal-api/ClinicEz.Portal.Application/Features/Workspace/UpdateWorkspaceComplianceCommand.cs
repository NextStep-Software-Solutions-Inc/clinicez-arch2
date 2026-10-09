using ClinicEz.Portal.Application.Interfaces;
using FluentValidation;
using MassTransit;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// Replaces the whole "compliance" section: the Data Protection Officer and the public privacy notice.
/// Blank values clear the field. Facing patients, so it is part of the facility-facing workspace profile.
/// </summary>
public record UpdateWorkspaceComplianceCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    string? DpoName,
    string? DpoEmail,
    string? PrivacyNoticeUrl
) : IRequest<WorkspaceComplianceDto>;

public class UpdateWorkspaceComplianceCommandValidator : AbstractValidator<UpdateWorkspaceComplianceCommand>
{
    public UpdateWorkspaceComplianceCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");

        When(x => !string.IsNullOrWhiteSpace(x.DpoName), () =>
        {
            RuleFor(x => x.DpoName!).Must(n => n.Trim().Length is >= 2 and <= 120)
                .WithMessage("DPO name must be between 2 and 120 characters.");
        });

        When(x => !string.IsNullOrWhiteSpace(x.DpoEmail), () =>
        {
            RuleFor(x => x.DpoEmail!).EmailAddress().MaximumLength(254)
                .WithMessage("DPO email must be a valid email address.");
        });

        When(x => !string.IsNullOrWhiteSpace(x.PrivacyNoticeUrl), () =>
        {
            RuleFor(x => x.PrivacyNoticeUrl!).Must(PublicHttpsUrl.IsValid)
                .WithMessage("Privacy notice must be a public https:// URL (max 2048 characters).");
        });

        // A published notice must name who to contact, otherwise the DPO fields are meaningless.
        RuleFor(x => x).Must(x => string.IsNullOrWhiteSpace(x.DpoEmail) || !string.IsNullOrWhiteSpace(x.DpoName))
            .WithName("DpoName")
            .WithMessage("DPO name is required when a DPO email is set.");
    }
}

public class UpdateWorkspaceComplianceCommandHandler(IApplicationDbContext context, IPublishEndpoint publishEndpoint)
    : IRequestHandler<UpdateWorkspaceComplianceCommand, WorkspaceComplianceDto>
{
    public async Task<WorkspaceComplianceDto> Handle(UpdateWorkspaceComplianceCommand request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var settings = await WorkspaceSettingsStore.GetOrCreateAsync(context, tenant, cancellationToken);
        var changes = new WorkspaceChangeSet();

        var name = Normalize(request.DpoName);
        var email = Normalize(request.DpoEmail)?.ToLowerInvariant();
        var url = Normalize(request.PrivacyNoticeUrl);

        changes.Track("dpoName", settings.DpoName, name);
        changes.Track("dpoEmail", settings.DpoEmail, email);
        changes.Track("privacyNoticeUrl", settings.PrivacyNoticeUrl, url);

        settings.DpoName = name;
        settings.DpoEmail = email;
        settings.PrivacyNoticeUrl = url;

        if (changes.HasChanges)
        {
            WorkspaceSettingsStore.BumpProfileVersion(settings);
            changes.Stage(context, tenant.Id, request.Actor, section: "compliance");
        }

        await context.SaveChangesAsync(cancellationToken);

        if (changes.HasChanges) await WorkspaceProfileEvents.PublishUpdatedAsync(publishEndpoint, tenant, settings, cancellationToken);

        return WorkspaceSettingsMapper.ToCompliance(settings);
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
