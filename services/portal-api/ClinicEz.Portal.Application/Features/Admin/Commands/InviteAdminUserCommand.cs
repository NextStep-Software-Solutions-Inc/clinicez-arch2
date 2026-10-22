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

        var existing = await context.AdminUsers
            .AnyAsync(u => u.Email.ToLower() == emailLower, cancellationToken);
        if (existing)
        {
            throw new InvalidOperationException("An admin with this email already exists.");
        }

        var role = await context.AdminRoles
            .FirstOrDefaultAsync(r => r.Id == request.RoleId, cancellationToken)
            ?? throw new KeyNotFoundException($"Role with ID '{request.RoleId}' not found.");

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var token = TokenGenerator.GenerateSecureToken(32);

        var user = new AdminUser
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
        await context.SaveChangesAsync(cancellationToken);

        var delivery = string.IsNullOrEmpty(request.DeliveryMode) ? "email" : request.DeliveryMode.ToLowerInvariant();
        if (delivery == "email")
        {
            await invitationNotifier.RequestInvitationAsync(user, role.Name, request.CreatedBy, cancellationToken);
        }

        var baseUrl = frontendUrlProvider.GetBaseUrl();
        return AdminUserMapping.ToDto(user, timeProvider, baseUrl);
    }
}
