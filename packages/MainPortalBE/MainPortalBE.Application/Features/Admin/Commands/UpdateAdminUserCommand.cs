using MediatR;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Admin.Commands;

public record UpdateAdminUserCommand(
    Guid Id,
    string Email,
    string FullName,
    Guid RoleId,
    bool IsActive,
    string UpdatedBy
) : IRequest<AdminUser?>;

public class UpdateAdminUserCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateAdminUserCommand, AdminUser?>
{
    public async Task<AdminUser?> Handle(UpdateAdminUserCommand request, CancellationToken cancellationToken)
    {
        var user = await context.AdminUsers.FirstOrDefaultAsync(u => u.Id == request.Id, cancellationToken);
        if (user == null) return null;

        if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.FullName)) return null;

        var existing = await context.AdminUsers.AnyAsync(u => u.Email.ToLower() == request.Email.ToLower() && u.Id != request.Id, cancellationToken);
        if (existing) throw new Exception("An admin with this email already exists.");

        user.FullName = request.FullName;
        user.Email = request.Email;
        user.RoleId = request.RoleId;
        user.IsActive = request.IsActive;
        user.UpdatedAt = DateTime.UtcNow;
        user.UpdatedBy = request.UpdatedBy;

        await context.SaveChangesAsync(cancellationToken);
        return user;
    }
}
