using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record AdminMeResponse(
    bool IsAdmin,
    string FullName,
    string Email,
    string RoleName,
    List<string> Permissions
);

public record GetAdminMeQuery(string ClerkUserId, string? Email) : IRequest<AdminMeResponse?>;

public class GetAdminMeQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAdminMeQuery, AdminMeResponse?>
{
    public async Task<AdminMeResponse?> Handle(GetAdminMeQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.ClerkUserId)) return null;

        var admin = await context.AdminUsers
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.ClerkUserId == request.ClerkUserId, cancellationToken);

        if (admin == null && !string.IsNullOrEmpty(request.Email))
        {
            admin = await context.AdminUsers
                .Include(u => u.Role)
                .FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower(), cancellationToken);

            if (admin != null)
            {
                admin.ClerkUserId = request.ClerkUserId;
                await context.SaveChangesAsync(cancellationToken);
            }
        }

        if (admin == null || !admin.IsActive || admin.Role == null) return null;

        // Ensure Super Admin role always inherits Permissions.All
        var isSuperAdmin = admin.Role.Id == Guid.Parse("44444444-4444-4444-4444-444444444444") ||
                           string.Equals(admin.Role.Name, "Super Admin", StringComparison.OrdinalIgnoreCase);

        if (isSuperAdmin)
        {
            var missingPerms = Permissions.All.Except(admin.Role.Permissions).ToList();
            if (missingPerms.Count > 0)
            {
                admin.Role.Permissions = new List<string>(Permissions.All);
                await context.SaveChangesAsync(cancellationToken);
            }
        }

        return new AdminMeResponse(
            true,
            admin.FullName,
            admin.Email,
            admin.Role.Name,
            admin.Role.Permissions
        );
    }
}
