using MediatR;
using MainPortalBE.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Admin.Queries;

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

        return new AdminMeResponse(
            true,
            admin.FullName,
            admin.Email,
            admin.Role.Name,
            admin.Role.Permissions
        );
    }
}
