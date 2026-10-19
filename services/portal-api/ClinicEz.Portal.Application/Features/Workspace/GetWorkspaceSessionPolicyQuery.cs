using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// The part of the security policy every signed-in workspace member needs in order to behave correctly
/// (the full settings are Owner/Admin only).
/// </summary>
public record WorkspaceSessionPolicyDto(bool RequireMfa, int IdleTimeoutMinutes);

public record GetWorkspaceSessionPolicyQuery(string TenantSlug) : IRequest<WorkspaceSessionPolicyDto?>;

public class GetWorkspaceSessionPolicyQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetWorkspaceSessionPolicyQuery, WorkspaceSessionPolicyDto?>
{
    public async Task<WorkspaceSessionPolicyDto?> Handle(GetWorkspaceSessionPolicyQuery request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken);
        if (tenant == null) return null;

        var settings = await context.WorkspaceSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenant.Id, cancellationToken)
            ?? new WorkspaceSettings { TenantId = tenant.Id };

        return new WorkspaceSessionPolicyDto(settings.RequireMfa, settings.IdleTimeoutMinutes);
    }
}
