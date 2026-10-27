using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Staff.Commands;

public record AcceptInvitationResultDto(
    string TenantSlug,
    string WorkspaceName,
    string Role,
    string FullName
);

public record AcceptInvitationCommand(
    string Token,
    string ClerkUserId,
    string? UserEmail = null,
    IReadOnlyList<string>? VerifiedEmails = null
) : IRequest<AcceptInvitationResultDto>;

public class AcceptInvitationCommandValidator : AbstractValidator<AcceptInvitationCommand>
{
    public AcceptInvitationCommandValidator()
    {
        RuleFor(x => x.Token).NotEmpty().WithMessage("Invitation token is required.");
        RuleFor(x => x.ClerkUserId).NotEmpty().WithMessage("User identity is required.");
    }
}

/// <summary>
/// Accepting an invitation makes the user a member of the inviting workspace. It never grants ownership, and a
/// user can join any number of workspaces.
/// </summary>
public class AcceptInvitationCommandHandler(
    IApplicationDbContext context,
    IClerkMetadataSync clerkMetadata,
    TimeProvider timeProvider,
    IClerkUserLookup? clerkLookup = null) : IRequestHandler<AcceptInvitationCommand, AcceptInvitationResultDto>
{
    public async Task<AcceptInvitationResultDto> Handle(AcceptInvitationCommand request, CancellationToken cancellationToken)
    {
        var member = await context.WorkspaceMembers
            .Include(m => m.Tenant)
            .FirstOrDefaultAsync(m => m.InvitationToken == request.Token, cancellationToken)
            ?? throw new KeyNotFoundException("Invitation was not found or is invalid.");

        var profile = await context.StaffMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.WorkspaceMemberId == member.Id, cancellationToken);

        var result = new AcceptInvitationResultDto(
            member.Tenant.TenantSlug,
            member.Tenant.Name,
            StaffMemberMapping.RoleName(member, profile),
            member.FullName);

        // If the user already accepted this invitation previously
        if (member.Status == MemberStatus.Active && member.UserId == request.ClerkUserId)
        {
            return result;
        }

        if (member.Status == MemberStatus.Revoked)
        {
            throw new InvalidOperationException("This invitation has been revoked.");
        }

        if (member.Status == MemberStatus.Suspended)
        {
            throw new InvalidOperationException("This account is suspended.");
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        if (member.InvitationExpiresAt.HasValue && member.InvitationExpiresAt.Value < now)
        {
            throw new InvalidOperationException("This invitation has expired. Please ask your clinic administrator to resend the invitation.");
        }

        if (member.Status != MemberStatus.Invited)
        {
            throw new InvalidOperationException("This invitation is no longer active or has already been used.");
        }

        var matchedEmail = await InvitationEmailVerifier.EnsureEmailMatchesAsync(
            member.Email,
            request.UserEmail,
            request.VerifiedEmails,
            request.ClerkUserId,
            clerkLookup,
            cancellationToken);

        // The allow-list may have been tightened after this invitation was sent; check both the invited
        // address and the verified address of the account that is accepting it.
        var allowedDomains = await context.WorkspaceSettings
            .AsNoTracking()
            .Where(s => s.TenantId == member.TenantId)
            .Select(s => s.AllowedInviteDomains)
            .FirstOrDefaultAsync(cancellationToken);
        if (!InviteDomains.IsAllowed(allowedDomains, member.Email) ||
            !InviteDomains.IsAllowed(allowedDomains, matchedEmail))
        {
            throw new InvalidOperationException("Your email domain is not permitted to join this workspace. Contact the workspace administrator.");
        }

        var alreadyMember = await context.WorkspaceMembers.AnyAsync(
            m => m.TenantId == member.TenantId && m.UserId == request.ClerkUserId && m.Id != member.Id,
            cancellationToken);
        if (alreadyMember)
        {
            throw new InvalidOperationException("This account is already a member of this workspace.");
        }

        // Link the authenticated user to the invited membership. The role stays exactly as it was invited
        // (never Owner); the single owner is the person who created the workspace.
        member.UserId = request.ClerkUserId;
        member.Status = MemberStatus.Active;
        member.JoinedAt = now;

        await context.SaveChangesAsync(cancellationToken);
        await clerkMetadata.SyncAsync(request.ClerkUserId, cancellationToken);

        return result;
    }
}
