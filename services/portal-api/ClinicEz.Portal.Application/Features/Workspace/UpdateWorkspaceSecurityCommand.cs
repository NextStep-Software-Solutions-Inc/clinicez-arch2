using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// Replaces the whole "security" section. Enforcement: MFA and idle timeout are applied by the portal
/// dashboard; the invite-domain list is enforced by the invitation commands.
/// </summary>
public record UpdateWorkspaceSecurityCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    bool RequireMfa,
    int IdleTimeoutMinutes,
    IReadOnlyList<string>? AllowedInviteDomains
) : IRequest<WorkspaceSecurityDto>;

public class UpdateWorkspaceSecurityCommandValidator : AbstractValidator<UpdateWorkspaceSecurityCommand>
{
    public UpdateWorkspaceSecurityCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");

        RuleFor(x => x.IdleTimeoutMinutes)
            .Must(m => m == 0 || (m >= WorkspaceSettings.MinIdleTimeoutMinutes && m <= WorkspaceSettings.MaxIdleTimeoutMinutes))
            .WithMessage($"Idle timeout must be 0 (off) or between {WorkspaceSettings.MinIdleTimeoutMinutes} and {WorkspaceSettings.MaxIdleTimeoutMinutes} minutes.");

        RuleFor(x => x.AllowedInviteDomains)
            .Must(d => InviteDomains.Normalize(d).Count <= InviteDomains.MaxDomains)
            .WithMessage($"At most {InviteDomains.MaxDomains} email domains can be listed.");

        RuleFor(x => x.AllowedInviteDomains)
            .Must(d => InviteDomains.Normalize(d).All(InviteDomains.IsValidDomain))
            .WithMessage("Email domains must look like clinic.example.com (no spaces, @ prefix or paths).");
    }
}

public class UpdateWorkspaceSecurityCommandHandler(IApplicationDbContext context)
    : IRequestHandler<UpdateWorkspaceSecurityCommand, WorkspaceSecurityDto>
{
    public async Task<WorkspaceSecurityDto> Handle(UpdateWorkspaceSecurityCommand request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken)
            ?? throw new ClinicEz.Shared.Exceptions.NotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var settings = await WorkspaceSettingsStore.GetOrCreateAsync(context, tenant, cancellationToken);
        var changes = new WorkspaceChangeSet();

        var domains = InviteDomains.Serialize(InviteDomains.Normalize(request.AllowedInviteDomains));

        changes.Track("requireMfa", settings.RequireMfa, request.RequireMfa);
        changes.Track("idleTimeoutMinutes", settings.IdleTimeoutMinutes, request.IdleTimeoutMinutes);
        changes.Track("allowedInviteDomains", settings.AllowedInviteDomains, domains);

        settings.RequireMfa = request.RequireMfa;
        settings.IdleTimeoutMinutes = request.IdleTimeoutMinutes;
        settings.AllowedInviteDomains = domains;

        // Security policy is portal-only: it is not part of the facility profile, so no version bump/event.
        changes.Stage(context, tenant.Id, request.Actor, section: "security");
        await context.SaveChangesAsync(cancellationToken);

        return WorkspaceSettingsMapper.ToSecurity(settings);
    }
}
