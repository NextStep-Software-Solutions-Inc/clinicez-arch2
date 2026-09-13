using MediatR;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Admin.Commands;

public record CreateAdminUserCommand(
    string Email,
    string FullName,
    Guid RoleId,
    string CreatedBy
) : IRequest<AdminUser?>;

public class CreateAdminUserCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateAdminUserCommand, AdminUser?>
{
    public async Task<AdminUser?> Handle(CreateAdminUserCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.FullName)) return null;

        var existing = await context.AdminUsers.AnyAsync(u => u.Email.ToLower() == request.Email.ToLower(), cancellationToken);
        if (existing) throw new Exception("An admin with this email already exists.");

        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            FullName = request.FullName,
            RoleId = request.RoleId,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.CreatedBy
        };

        await context.AdminUsers.AddAsync(user, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
        return user;
    }
}
