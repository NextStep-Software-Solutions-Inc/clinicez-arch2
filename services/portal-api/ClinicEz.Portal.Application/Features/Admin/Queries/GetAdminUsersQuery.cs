using MediatR;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record GetAdminUsersQuery : IRequest<List<AdminUserDto>>;

public class GetAdminUsersQueryHandler(
    IApplicationDbContext context,
    IFrontendUrlProvider frontendUrlProvider,
    TimeProvider timeProvider
) : IRequestHandler<GetAdminUsersQuery, List<AdminUserDto>>
{
    public async Task<List<AdminUserDto>> Handle(GetAdminUsersQuery request, CancellationToken cancellationToken)
    {
        var users = await context.AdminUsers
            .Include(u => u.Role)
            .OrderByDescending(u => u.CreatedAt)
            .ToListAsync(cancellationToken);

        var baseUrl = frontendUrlProvider.GetBaseUrl();

        return users.Select(u => AdminUserMapping.ToDto(u, timeProvider, baseUrl)).ToList();
    }
}
