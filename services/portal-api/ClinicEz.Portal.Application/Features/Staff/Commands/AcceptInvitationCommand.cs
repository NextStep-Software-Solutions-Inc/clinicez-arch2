using ClinicEz.Portal.Application.Interfaces;
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
    string? UserEmail = null
) : IRequest<AcceptInvitationResultDto>;

public class AcceptInvitationCommandValidator : AbstractValidator<AcceptInvitationCommand>
{
    public AcceptInvitationCommandValidator()
    {
        RuleFor(x => x.Token).NotEmpty().WithMessage("Invitation token is required.");
        RuleFor(x => x.ClerkUserId).NotEmpty().WithMessage("User identity is required.");
    }
}

public class AcceptInvitationCommandHandler(IApplicationDbContext context) : IRequestHandler<AcceptInvitationCommand, AcceptInvitationResultDto>
{
    public async Task<AcceptInvitationResultDto> Handle(AcceptInvitationCommand request, CancellationToken cancellationToken)
    {
        var member = await context.StaffMembers
            .Include(s => s.Tenant)
            .FirstOrDefaultAsync(s => s.InvitationToken == request.Token, cancellationToken)
            ?? throw new KeyNotFoundException("Invitation was not found or is invalid.");

        // If the user already accepted this invitation previously
        if (member.Status.Equals("Active", StringComparison.OrdinalIgnoreCase) && member.UserId == request.ClerkUserId)
        {
            return new AcceptInvitationResultDto(
                member.Tenant.TenantSlug,
                member.Tenant.Name,
                member.Role,
                member.FullName
            );
        }

        if (!member.Status.Equals("PendingInvitation", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("This invitation is no longer active or has already been used.");
        }

        if (member.InvitationExpiresAt.HasValue && member.InvitationExpiresAt.Value < DateTime.UtcNow)
        {
            throw new InvalidOperationException("This invitation has expired. Please ask your clinic administrator to resend the invitation.");
        }

        // Link the authenticated user to the internal staff record
        member.UserId = request.ClerkUserId;
        member.Status = "Active";
        member.JoinedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);

        return new AcceptInvitationResultDto(
            member.Tenant.TenantSlug,
            member.Tenant.Name,
            member.Role,
            member.FullName
        );
    }
}
