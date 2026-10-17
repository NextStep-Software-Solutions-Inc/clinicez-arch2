using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record AdminArchiveTenantCommand(Guid TenantId, string AdminName, string? Reason = null) 
    : IRequest<AdminArchiveTenantResultDto>;

public record AdminArchiveTenantResultDto(Guid TenantId, string TenantSlug, DateTime ArchivedAt, int FacilitiesSuspended);

public class AdminArchiveTenantCommandValidator : AbstractValidator<AdminArchiveTenantCommand>
{
    public AdminArchiveTenantCommandValidator()
    {
        RuleFor(x => x.TenantId).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.AdminName).NotEmpty().WithMessage("Admin name is required.");
    }
}

public class AdminArchiveTenantCommandHandler(
    IApplicationDbContext context, 
    IHubOnboardingService hubOnboarding)
    : IRequestHandler<AdminArchiveTenantCommand, AdminArchiveTenantResultDto>
{
    public async Task<AdminArchiveTenantResultDto> Handle(AdminArchiveTenantCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken)
            ?? throw new NotFoundException($"Workspace with ID '{request.TenantId}' was not found.");

        if (tenant.ArchivedAt != null)
            throw new ConflictException($"Workspace '{tenant.TenantSlug}' is already archived.");

        if (await context.Subscriptions.AnyAsync(s => s.TenantId == tenant.Id && s.Status == SubscriptionStatus.Active, cancellationToken))
            throw new ConflictException("Cancel or terminate the active subscription in Billing before archiving the workspace.");

        var facilities = await context.Facilities
            .Where(f => f.TenantId == tenant.Id && f.Status != FacilityStatus.Suspended)
            .ToListAsync(cancellationToken);

        foreach (var facility in facilities)
        {
            facility.Status = FacilityStatus.Suspended;
        }

        var now = DateTime.UtcNow;
        tenant.ArchivedAt = now;

        var actor = new WorkspaceActor(request.AdminName, request.AdminName, "SuperAdmin");
        var changes = new WorkspaceChangeSet();
        changes.Track("archivedAt", (DateTime?)null, now);
        changes.Track("facilitiesSuspended", 0, facilities.Count);
        if (!string.IsNullOrWhiteSpace(request.Reason))
        {
            changes.Track("archiveReason", string.Empty, request.Reason);
        }
        changes.Stage(context, tenant.Id, actor, section: "admin", action: "archived");

        await context.SaveChangesAsync(cancellationToken);
        await hubOnboarding.RevokeWorkspaceAsync(tenant.Id, cancellationToken);

        return new AdminArchiveTenantResultDto(tenant.Id, tenant.TenantSlug, now, facilities.Count);
    }
}
