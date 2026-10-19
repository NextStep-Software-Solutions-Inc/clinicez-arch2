using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// Closes the workspace in the portal: sets <see cref="Tenant.ArchivedAt"/> and marks every facility Suspended
/// (which also hides their console links) and revokes the workspace's on-premise hub clients. Data is kept; restoring is a support action. Owner only, refused
/// while a paid subscription is active, and the caller must type the workspace slug.
/// </summary>
public record ArchiveWorkspaceCommand(string TenantSlug, WorkspaceActor Actor, string ConfirmSlug) : IRequest<ArchiveWorkspaceResultDto>;

public record ArchiveWorkspaceResultDto(DateTime ArchivedAt, int FacilitiesSuspended);

public class ArchiveWorkspaceCommandValidator : AbstractValidator<ArchiveWorkspaceCommand>
{
    public ArchiveWorkspaceCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.ConfirmSlug)
            .Must((cmd, typed) => string.Equals(typed?.Trim(), cmd.TenantSlug, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Type the workspace slug exactly to confirm.");
    }
}

public class ArchiveWorkspaceCommandHandler(IApplicationDbContext context, IHubOnboardingService hubOnboarding)
    : IRequestHandler<ArchiveWorkspaceCommand, ArchiveWorkspaceResultDto>
{
    public async Task<ArchiveWorkspaceResultDto> Handle(ArchiveWorkspaceCommand request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken)
            ?? throw new ClinicEz.Shared.Exceptions.NotFoundException($"Workspace '{request.TenantSlug}' not found.");

        if (tenant.OwnerId != request.Actor.UserId)
            throw new ClinicEz.Shared.Exceptions.ForbiddenException("Only the workspace owner can archive it.");

        if (tenant.ArchivedAt != null)
            throw new ClinicEz.Shared.Exceptions.ConflictException("This workspace is already archived.");

        if (await context.Subscriptions.AnyAsync(s => s.TenantId == tenant.Id && s.Status == SubscriptionStatus.Active, cancellationToken))
            throw new ClinicEz.Shared.Exceptions.ConflictException("Cancel the active subscription in Billing before archiving the workspace.");

        var facilities = await context.Facilities
            .Where(f => f.TenantId == tenant.Id && f.Status != FacilityStatus.Suspended)
            .ToListAsync(cancellationToken);
        foreach (var facility in facilities) facility.Status = FacilityStatus.Suspended;

        var now = DateTime.UtcNow;
        tenant.ArchivedAt = now;

        var changes = new WorkspaceChangeSet();
        changes.Track("archivedAt", (DateTime?)null, now);
        changes.Track("facilitiesSuspended", 0, facilities.Count);
        changes.Stage(context, tenant.Id, request.Actor, section: "workspace", action: "archived");

        await context.SaveChangesAsync(cancellationToken);
        await hubOnboarding.RevokeWorkspaceAsync(tenant.Id, cancellationToken);

        return new ArchiveWorkspaceResultDto(now, facilities.Count);
    }
}
