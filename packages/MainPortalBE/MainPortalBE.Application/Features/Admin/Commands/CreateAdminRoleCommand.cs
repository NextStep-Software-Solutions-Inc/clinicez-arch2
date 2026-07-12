using MediatR;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Admin.Commands;

public record CreateAdminRoleCommand(
    string Name,
    string Description,
    List<string> Permissions,
    string CreatedBy
) : IRequest<AdminRole?>;

public class CreateAdminRoleCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateAdminRoleCommand, AdminRole?>
{
    public async Task<AdminRole?> Handle(CreateAdminRoleCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.Name)) return null;

        var existing = await context.AdminRoles.AnyAsync(r => r.Name.ToLower() == request.Name.ToLower(), cancellationToken);
        if (existing) throw new Exception("Role name must be unique.");

        var role = new AdminRole
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            Permissions = request.Permissions,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.CreatedBy
        };

        await context.AdminRoles.AddAsync(role, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
        return role;
    }
}
