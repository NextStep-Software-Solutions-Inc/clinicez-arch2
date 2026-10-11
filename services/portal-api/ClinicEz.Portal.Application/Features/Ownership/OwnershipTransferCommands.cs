using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Ownership;

/// <summary>What the website shows about an open ownership offer.</summary>
public record OwnershipTransferDto(
    Guid Id,
    Guid TargetMemberId,
    string TargetName,
    string TargetEmail,
    string Status,
    DateTime ExpiresAt,
    DateTime CreatedAt);

public record OwnershipTransferResultDto(string NewOwnerName, string NewOwnerEmail, string PreviousOwnerNewRole);

internal static class OwnershipTransfers
{
    public static async Task<Tenant> FindTenantAsync(IApplicationDbContext context, string slugOrId, CancellationToken ct)
    {
        var key = slugOrId.Trim().ToLowerInvariant();
        return await context.Tenants.FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, ct)
            ?? throw new NotFoundException($"Workspace '{slugOrId}' not found.");
    }

    /// <summary>The workspace's pending offer, after retiring one that has run past its expiry.</summary>
    public static async Task<OwnershipTransfer?> FindOpenAsync(
        IApplicationDbContext context, Guid tenantId, DateTime now, CancellationToken ct)
    {
        var pending = await context.OwnershipTransfers
            .Include(o => o.TargetMember)
            .FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Status == OwnershipTransferStatus.Pending, ct);
        if (pending is null) return null;

        if (!pending.IsOpen(now))
        {
            pending.Status = OwnershipTransferStatus.Expired;
            pending.ResolvedAt = now;
            return null;
        }
        return pending;
    }

    public static OwnershipTransferDto ToDto(OwnershipTransfer offer) => new(
        offer.Id,
        offer.TargetMemberId,
        offer.TargetMember.FullName,
        offer.TargetMember.Email,
        offer.Status.ToString(),
        offer.ExpiresAt,
        offer.CreatedAt);
}

/// <summary>
/// Step one of handing the workspace over: the owner offers it to an active member who owns no workspace.
/// Nothing changes until the target accepts. One offer per workspace, valid for seven days.
/// </summary>
public record OfferOwnershipTransferCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    Guid TargetStaffMemberId,
    string ConfirmSlug
) : IRequest<OwnershipTransferDto>;

public class OfferOwnershipTransferCommandValidator : AbstractValidator<OfferOwnershipTransferCommand>
{
    public OfferOwnershipTransferCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.TargetStaffMemberId).NotEmpty().WithMessage("Choose who becomes the new owner.");
        RuleFor(x => x.ConfirmSlug)
            .Must((cmd, typed) => string.Equals(typed?.Trim(), cmd.TenantSlug, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Type the workspace slug exactly to confirm.");
    }
}

public class OfferOwnershipTransferCommandHandler(
    IApplicationDbContext context,
    IOwnershipPolicy ownership,
    TimeProvider timeProvider) : IRequestHandler<OfferOwnershipTransferCommand, OwnershipTransferDto>
{
    public async Task<OwnershipTransferDto> Handle(OfferOwnershipTransferCommand request, CancellationToken cancellationToken)
    {
        var tenant = await OwnershipTransfers.FindTenantAsync(context, request.TenantSlug, cancellationToken);

        // Defence in depth: the endpoint already requires the Owner role.
        if (tenant.OwnerId != request.Actor.UserId)
            throw new ForbiddenException("Only the workspace owner can transfer ownership.");

        if (tenant.ArchivedAt != null)
            throw new ConflictException("This workspace is archived.");

        var target = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.Id == request.TargetStaffMemberId && m.TenantId == tenant.Id, cancellationToken)
            ?? throw new NotFoundException("That team member was not found in this workspace.");

        if (string.IsNullOrEmpty(target.UserId) || target.Status != MemberStatus.Active)
            throw new BadRequestException("The new owner must be an active member who has accepted their invitation.");

        if (target.UserId == tenant.OwnerId)
            throw new BadRequestException("That person is already the owner.");

        await ownership.EnsureCanOwnAsync(target.UserId, ConflictCodes.TargetAlreadyOwnsWorkspace, cancellationToken);

        var now = timeProvider.GetUtcNow().UtcDateTime;
        if (await OwnershipTransfers.FindOpenAsync(context, tenant.Id, now, cancellationToken) is not null)
            throw new ConflictException("An ownership offer is already waiting for an answer. Cancel it before making another.");

        var offer = new OwnershipTransfer
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            TargetMemberId = target.Id,
            TargetMember = target,
            OfferedByUserId = request.Actor.UserId,
            Status = OwnershipTransferStatus.Pending,
            ExpiresAt = now.Add(OwnershipTransfer.OfferLifetime),
            CreatedAt = now,
            CreatedBy = request.Actor.UserId
        };
        context.OwnershipTransfers.Add(offer);

        var changes = new WorkspaceChangeSet();
        changes.Track("ownershipOffer", (string?)null, target.FullName);
        changes.Stage(context, tenant.Id, request.Actor, section: "ownership", action: "offered");

        await context.SaveChangesAsync(cancellationToken);
        return OwnershipTransfers.ToDto(offer);
    }
}

/// <summary>The open offer, visible to the owner who made it and to the member it is addressed to; null for everyone else.</summary>
public record GetOwnershipTransferQuery(string TenantSlug, string UserId) : IRequest<OwnershipTransferDto?>;

public class GetOwnershipTransferQueryHandler(
    IApplicationDbContext context,
    TimeProvider timeProvider) : IRequestHandler<GetOwnershipTransferQuery, OwnershipTransferDto?>
{
    public async Task<OwnershipTransferDto?> Handle(GetOwnershipTransferQuery request, CancellationToken cancellationToken)
    {
        var tenant = await OwnershipTransfers.FindTenantAsync(context, request.TenantSlug, cancellationToken);
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var offer = await OwnershipTransfers.FindOpenAsync(context, tenant.Id, now, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);

        if (offer is null) return null;
        var visible = tenant.OwnerId == request.UserId || offer.TargetMember.UserId == request.UserId;
        return visible ? OwnershipTransfers.ToDto(offer) : null;
    }
}

/// <summary>Step two: the member the offer is addressed to takes the workspace. The previous owner stays on as an Admin.</summary>
public record AcceptOwnershipTransferCommand(string TenantSlug, WorkspaceActor Actor) : IRequest<OwnershipTransferResultDto>;

public class AcceptOwnershipTransferCommandHandler(
    IApplicationDbContext context,
    IOwnershipPolicy ownership,
    IClerkMetadataSync clerkMetadata,
    TimeProvider timeProvider) : IRequestHandler<AcceptOwnershipTransferCommand, OwnershipTransferResultDto>
{
    public async Task<OwnershipTransferResultDto> Handle(AcceptOwnershipTransferCommand request, CancellationToken cancellationToken)
    {
        var tenant = await OwnershipTransfers.FindTenantAsync(context, request.TenantSlug, cancellationToken);
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var offer = await OwnershipTransfers.FindOpenAsync(context, tenant.Id, now, cancellationToken);
        if (offer is null)
        {
            await context.SaveChangesAsync(cancellationToken);
            throw new NotFoundException("There is no open ownership offer for this workspace (it may have expired).");
        }

        var target = offer.TargetMember;
        if (target.UserId != request.Actor.UserId)
            throw new ForbiddenException("This ownership offer is addressed to someone else.");

        if (target.Status != MemberStatus.Active)
            throw new ConflictException("You are no longer an active member of this workspace.");

        if (tenant.ArchivedAt != null)
            throw new ConflictException("This workspace is archived.");

        await ownership.EnsureCanOwnAsync(request.Actor.UserId, ConflictCodes.TargetAlreadyOwnsWorkspace, cancellationToken);

        var previousOwnerId = tenant.OwnerId;
        var previousOwner = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.TenantId == tenant.Id && m.UserId == previousOwnerId, cancellationToken);
        if (previousOwner is null)
        {
            previousOwner = new WorkspaceMember
            {
                Id = Guid.NewGuid(),
                TenantId = tenant.Id,
                UserId = previousOwnerId,
                Email = tenant.Email.Trim().ToLowerInvariant(),
                FullName = $"{tenant.FirstName} {tenant.LastName}".Trim(),
                Status = MemberStatus.Active,
                JoinedAt = tenant.CreatedAt,
                CreatedAt = now,
                CreatedBy = previousOwnerId
            };
            context.WorkspaceMembers.Add(previousOwner);
            tenant.StaffAccountsCount += 1;
        }

        previousOwner.Role = WorkspaceMemberRole.Admin;
        previousOwner.Status = MemberStatus.Active;
        target.Role = WorkspaceMemberRole.Owner;
        tenant.OwnerId = request.Actor.UserId;

        offer.Status = OwnershipTransferStatus.Accepted;
        offer.ResolvedAt = now;

        var changes = new WorkspaceChangeSet();
        changes.Track("owner", previousOwner.FullName, target.FullName);
        changes.Stage(context, tenant.Id, request.Actor, section: "ownership", action: "transferred");

        await ownership.SaveAsync(ConflictCodes.TargetAlreadyOwnsWorkspace, cancellationToken);

        await clerkMetadata.SyncAsync(previousOwnerId, cancellationToken);
        await clerkMetadata.SyncAsync(request.Actor.UserId, cancellationToken);

        return new OwnershipTransferResultDto(target.FullName, target.Email, WorkspaceMemberRole.Admin.ToString());
    }
}

/// <summary>The addressed member turns the offer down.</summary>
public record DeclineOwnershipTransferCommand(string TenantSlug, WorkspaceActor Actor) : IRequest;

public class DeclineOwnershipTransferCommandHandler(
    IApplicationDbContext context,
    TimeProvider timeProvider) : IRequestHandler<DeclineOwnershipTransferCommand>
{
    public async Task Handle(DeclineOwnershipTransferCommand request, CancellationToken cancellationToken)
    {
        var tenant = await OwnershipTransfers.FindTenantAsync(context, request.TenantSlug, cancellationToken);
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var offer = await OwnershipTransfers.FindOpenAsync(context, tenant.Id, now, cancellationToken);
        if (offer is null)
        {
            await context.SaveChangesAsync(cancellationToken);
            throw new NotFoundException("There is no open ownership offer for this workspace.");
        }

        if (offer.TargetMember.UserId != request.Actor.UserId)
            throw new ForbiddenException("This ownership offer is addressed to someone else.");

        offer.Status = OwnershipTransferStatus.Declined;
        offer.ResolvedAt = now;

        var changes = new WorkspaceChangeSet();
        changes.Track("ownershipOffer", offer.TargetMember.FullName, (string?)null);
        changes.Stage(context, tenant.Id, request.Actor, section: "ownership", action: "declined");

        await context.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>The owner withdraws the offer before it is answered.</summary>
public record CancelOwnershipTransferCommand(string TenantSlug, WorkspaceActor Actor) : IRequest;

public class CancelOwnershipTransferCommandHandler(
    IApplicationDbContext context,
    TimeProvider timeProvider) : IRequestHandler<CancelOwnershipTransferCommand>
{
    public async Task Handle(CancelOwnershipTransferCommand request, CancellationToken cancellationToken)
    {
        var tenant = await OwnershipTransfers.FindTenantAsync(context, request.TenantSlug, cancellationToken);
        if (tenant.OwnerId != request.Actor.UserId)
            throw new ForbiddenException("Only the workspace owner can cancel an ownership offer.");

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var offer = await OwnershipTransfers.FindOpenAsync(context, tenant.Id, now, cancellationToken);
        if (offer is null)
        {
            await context.SaveChangesAsync(cancellationToken);
            throw new NotFoundException("There is no open ownership offer for this workspace.");
        }

        offer.Status = OwnershipTransferStatus.Cancelled;
        offer.ResolvedAt = now;

        var changes = new WorkspaceChangeSet();
        changes.Track("ownershipOffer", offer.TargetMember.FullName, (string?)null);
        changes.Stage(context, tenant.Id, request.Actor, section: "ownership", action: "cancelled");

        await context.SaveChangesAsync(cancellationToken);
    }
}
