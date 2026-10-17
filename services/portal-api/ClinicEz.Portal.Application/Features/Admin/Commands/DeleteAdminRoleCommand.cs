using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record DeleteAdminRoleCommand(Guid Id, string DeletedBy) : IRequest<bool>;

public class DeleteAdminRoleCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteAdminRoleCommand, bool>
{
    private static readonly Guid SuperAdminRoleId = Guid.Parse("44444444-4444-4444-4444-444444444444");

    public async Task<bool> Handle(DeleteAdminRoleCommand request, CancellationToken cancellationToken)
    {
        if (request.Id == SuperAdminRoleId)
        {
            throw new InvalidOperationException("System built-in Super Admin role cannot be deleted.");
        }

        var role = await context.AdminRoles.FirstOrDefaultAsync(r => r.Id == request.Id, cancellationToken);
        if (role == null) return false;

        var isAssigned = await context.AdminUsers.AnyAsync(u => u.RoleId == request.Id, cancellationToken);
        if (isAssigned)
        {
            throw new InvalidOperationException("Cannot delete role that is currently assigned to admin users. Reassign users first.");
        }

        context.AdminRoles.Remove(role);
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
