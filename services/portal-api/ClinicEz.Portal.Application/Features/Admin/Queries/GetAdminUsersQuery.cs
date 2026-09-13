using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record GetAdminUsersQuery : IRequest<List<AdminUser>>;

public class GetAdminUsersQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAdminUsersQuery, List<AdminUser>>
{
    public async Task<List<AdminUser>> Handle(GetAdminUsersQuery request, CancellationToken cancellationToken)
    {
        return await context.AdminUsers
            .Include(u => u.Role)
            .OrderByDescending(u => u.CreatedAt)
            .ToListAsync(cancellationToken);
    }
}
