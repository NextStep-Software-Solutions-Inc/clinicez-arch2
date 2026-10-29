using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record InviteAdminUserCommand(
    string Email,
    string FullName,
    Guid RoleId,
    string DeliveryMode,
    string CreatedBy
) : IRequest<AdminUserDto>;

public class InviteAdminUserCommandValidator : AbstractValidator<InviteAdminUserCommand>
{
    public InviteAdminUserCommandValidator()
    {
        RuleFor(v => v.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("A valid email address is required.")
            .MaximumLength(150).WithMessage("Email must not exceed 150 characters.");

        RuleFor(v => v.FullName)
            .NotEmpty().WithMessage("Full name is required.")
            .MaximumLength(100).WithMessage("Full name must not exceed 100 characters.");

        RuleFor(v => v.RoleId)
            .NotEmpty().WithMessage("Role selection is required.");

        RuleFor(v => v.DeliveryMode)
            .Must(m => string.IsNullOrEmpty(m) ||
                       string.Equals(m, "email", StringComparison.OrdinalIgnoreCase) || 
                       string.Equals(m, "link", StringComparison.OrdinalIgnoreCase))
            .WithMessage("DeliveryMode must be either 'email' or 'link'.");
    }
}

public class InviteAdminUserCommandHandler(
    IApplicationDbContext context,
    IAdminInvitationNotifier invitationNotifier,
    IFrontendUrlProvider frontendUrlProvider,
    TimeProvider timeProvider
) : IRequestHandler<InviteAdminUserCommand, AdminUserDto>
{
    public async Task<AdminUserDto> Handle(InviteAdminUserCommand request, CancellationToken cancellationToken)
    {
        var emailLower = request.Email.Trim().ToLowerInvariant();

        var now = timeProvider.GetUtcNow().UtcDateTime;

        var existing = await context.AdminUsers
            .FirstOrDefaultAsync(u => u.Email.ToLower() == emailLower, cancellationToken);
        if (existing != null && existing.Status != AdminUserStatus.Revoked)
        {
            var isExpired = existing.Status == AdminUserStatus.Invited &&
                            existing.InvitationExpiresAt.HasValue &&
                            existing.InvitationExpiresAt.Value < now;

            throw new InvalidOperationException(existing.Status switch
            {
                AdminUserStatus.Active => $"An active admin with email '{request.Email}' already exists.",
                AdminUserStatus.Invited when isExpired => $"An expired invitation for '{request.Email}' already exists. Please resend the invitation instead.",
                AdminUserStatus.Invited => $"A pending invitation for '{request.Email}' already exists. Please resend the existing invitation instead.",
                AdminUserStatus.Suspended => $"A suspended admin account with email '{request.Email}' already exists. Please reactivate the account instead.",
                _ => "An admin with this email already exists."
            });
        }

        var role = await context.AdminRoles
            .FirstOrDefaultAsync(r => r.Id == request.RoleId, cancellationToken)
            ?? throw new KeyNotFoundException($"Role with ID '{request.RoleId}' not found.");

        var token = TokenGenerator.GenerateSecureToken(32);

        AdminUser user;
        if (existing != null)
        {
            user = existing;
            user.FullName = request.FullName.Trim();
            user.RoleId = request.RoleId;
            user.Role = role;
            user.IsActive = true;
            user.Status = AdminUserStatus.Invited;
            user.InvitationToken = token;
            user.InvitationExpiresAt = now.AddDays(7);
            user.ClerkUserId = null;
            user.JoinedAt = null;
            user.UpdatedAt = now;
            user.UpdatedBy = request.CreatedBy;
        }
        else
        {
            user = new AdminUser
            {
                Id = Guid.NewGuid(),
                Email = emailLower,
                FullName = request.FullName.Trim(),
                RoleId = request.RoleId,
                Role = role,
                IsActive = true,
                Status = AdminUserStatus.Invited,
                InvitationToken = token,
                InvitationExpiresAt = now.AddDays(7),
                CreatedAt = now,
                CreatedBy = request.CreatedBy
            };

            await context.AdminUsers.AddAsync(user, cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);

        var delivery = string.IsNullOrEmpty(request.DeliveryMode) ? "email" : request.DeliveryMode.ToLowerInvariant();
        if (delivery == "email")
        {
            invitationNotifier.RequestInvitation(user, role.Name, request.CreatedBy);
        }

        var baseUrl = frontendUrlProvider.GetAdminBaseUrl() ?? frontendUrlProvider.GetBaseUrl();
        return AdminUserMapping.ToDto(user, timeProvider, baseUrl);
    }
}
