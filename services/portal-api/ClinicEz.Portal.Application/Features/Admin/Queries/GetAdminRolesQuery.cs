using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record GetAdminRolesQuery : IRequest<List<AdminRole>>;

public class GetAdminRolesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAdminRolesQuery, List<AdminRole>>
{
    public async Task<List<AdminRole>> Handle(GetAdminRolesQuery request, CancellationToken cancellationToken)
    {
        return await context.AdminRoles
            .OrderBy(r => r.Name)
            .ToListAsync(cancellationToken);
    }
}
