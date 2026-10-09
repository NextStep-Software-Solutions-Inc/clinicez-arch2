using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// Hands workspace ownership to an existing active Admin. Immediate and not undoable by the previous
/// owner (who becomes an Admin). The caller must type the workspace slug to confirm.
/// </summary>
public record TransferWorkspaceOwnershipCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    Guid TargetStaffMemberId,
    string ConfirmSlug
) : IRequest<OwnershipTransferResultDto>;

public record OwnershipTransferResultDto(string NewOwnerName, string NewOwnerEmail, string PreviousOwnerNewRole);

public class TransferWorkspaceOwnershipCommandValidator : AbstractValidator<TransferWorkspaceOwnershipCommand>
{
    public TransferWorkspaceOwnershipCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.TargetStaffMemberId).NotEmpty().WithMessage("Choose who becomes the new owner.");
        RuleFor(x => x.ConfirmSlug)
            .Must((cmd, typed) => string.Equals(typed?.Trim(), cmd.TenantSlug, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Type the workspace slug exactly to confirm.");
    }
}

public class TransferWorkspaceOwnershipCommandHandler(IApplicationDbContext context)
    : IRequestHandler<TransferWorkspaceOwnershipCommand, OwnershipTransferResultDto>
{
    public async Task<OwnershipTransferResultDto> Handle(TransferWorkspaceOwnershipCommand request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken)
            ?? throw new ClinicEz.Shared.Exceptions.NotFoundException($"Workspace '{request.TenantSlug}' not found.");

        // Defence in depth: the endpoint already requires the Owner role.
        if (tenant.OwnerId != request.Actor.UserId)
            throw new ClinicEz.Shared.Exceptions.ForbiddenException("Only the workspace owner can transfer ownership.");

        if (tenant.ArchivedAt != null)
            throw new ClinicEz.Shared.Exceptions.ConflictException("This workspace is archived.");

        var target = await context.StaffMembers
            .FirstOrDefaultAsync(s => s.Id == request.TargetStaffMemberId && s.TenantId == tenant.Id, cancellationToken)
            ?? throw new ClinicEz.Shared.Exceptions.NotFoundException("That team member was not found in this workspace.");

        if (string.IsNullOrEmpty(target.UserId) || !string.Equals(target.Status, "Active", StringComparison.OrdinalIgnoreCase))
            throw new ClinicEz.Shared.Exceptions.BadRequestException("The new owner must be an active member who has accepted their invitation.");

        if (target.UserId == tenant.OwnerId)
            throw new ClinicEz.Shared.Exceptions.BadRequestException("That person is already the owner.");

        if (!string.Equals(target.Role, "Admin", StringComparison.OrdinalIgnoreCase))
            throw new ClinicEz.Shared.Exceptions.BadRequestException("Ownership can only be transferred to an Admin. Change their role to Admin first.");

        var previousOwnerId = tenant.OwnerId;
        var previousOwner = await context.StaffMembers
            .FirstOrDefaultAsync(s => s.TenantId == tenant.Id && s.UserId == previousOwnerId, cancellationToken);

        if (previousOwner == null)
        {
            // The owner may never have been listed as a team member; keep them in the workspace as an Admin.
            previousOwner = new StaffMember
            {
                TenantId = tenant.Id,
                UserId = previousOwnerId,
                Email = tenant.Email ?? string.Empty,
                FullName = request.Actor.Name,
                JoinedAt = tenant.CreatedAt
            };
            context.StaffMembers.Add(previousOwner);
            tenant.StaffAccountsCount += 1;
        }

        previousOwner.Role = "Admin";
        previousOwner.Status = "Active";
        target.Role = "Owner";
        tenant.OwnerId = target.UserId!;

        var changes = new WorkspaceChangeSet();
        changes.Track("owner", request.Actor.Name, target.FullName);
        changes.Stage(context, tenant.Id, request.Actor, section: "ownership", action: "transferred");

        await context.SaveChangesAsync(cancellationToken);

        return new OwnershipTransferResultDto(target.FullName, target.Email, previousOwner.Role);
    }
}
