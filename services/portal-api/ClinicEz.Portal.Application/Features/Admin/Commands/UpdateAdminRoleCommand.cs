using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Domain.Constants;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record UpdateAdminRoleCommand(
    Guid Id,
    string Name,
    string Description,
    List<string> Permissions,
    string UpdatedBy
) : IRequest<AdminRole?>;

public class UpdateAdminRoleCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateAdminRoleCommand, AdminRole?>
{
    private static readonly Guid SuperAdminRoleId = Guid.Parse("44444444-4444-4444-4444-444444444444");

    public async Task<AdminRole?> Handle(UpdateAdminRoleCommand request, CancellationToken cancellationToken)
    {
        if (request.Id == Guid.Empty || string.IsNullOrWhiteSpace(request.Name)) return null;

        var role = await context.AdminRoles.FirstOrDefaultAsync(r => r.Id == request.Id, cancellationToken);
        if (role == null) return null;

        // Check uniqueness of name if changed
        var nameConflict = await context.AdminRoles
            .AnyAsync(r => r.Id != request.Id && r.Name.ToLower() == request.Name.ToLower(), cancellationToken);
        if (nameConflict) throw new Exception("Role name must be unique.");

        role.Name = request.Name.Trim();
        role.Description = request.Description?.Trim() ?? string.Empty;

        // If this is the built-in Super Admin role, ensure it always maintains all system permissions
        if (role.Id == SuperAdminRoleId || role.Name == "Super Admin")
        {
            role.Permissions = new List<string>(ClinicEz.Portal.Domain.Constants.Permissions.All);
        }
        else
        {
            // Filter to only valid known permissions to avoid arbitrary strings
            var validPermissions = (request.Permissions ?? new List<string>())
                .Where(p => ClinicEz.Portal.Domain.Constants.Permissions.All.Contains(p))
                .Distinct()
                .ToList();

            if (validPermissions.Count == 0)
            {
                throw new Exception("Role must have at least one valid permission.");
            }

            role.Permissions = validPermissions;
        }

        await context.SaveChangesAsync(cancellationToken);
        return role;
    }
}
