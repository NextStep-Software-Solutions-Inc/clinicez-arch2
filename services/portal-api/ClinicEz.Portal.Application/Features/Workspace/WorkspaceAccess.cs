using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>Workspace-level role of the calling user. Ordered by privilege.</summary>
public enum WorkspaceRole
{
    None = 0,
    Staff = 1,
    Admin = 2,
    Owner = 3
}

/// <summary>Result of resolving who a user is inside a workspace.</summary>
public sealed record WorkspaceAccess(Tenant Tenant, string UserId, WorkspaceRole Role)
{
    public bool HasAtLeast(WorkspaceRole required) => Role >= required;

    public string RoleName => Role switch
    {
        WorkspaceRole.Owner => "Owner",
        WorkspaceRole.Admin => "Admin",
        WorkspaceRole.Staff => "Staff",
        _ => "None"
    };
}

/// <summary>
/// Single place that answers "who is this user in this workspace". Replaces the owner/admin lookup
/// that was copy-pasted into each endpoint.
/// </summary>
public interface IWorkspaceAccessService
{
    /// <summary>Returns null when the workspace does not exist; otherwise the user's role (possibly <see cref="WorkspaceRole.None"/>).</summary>
    Task<WorkspaceAccess?> ResolveAsync(string tenantSlugOrId, string userId, CancellationToken cancellationToken = default);
}

public sealed class WorkspaceAccessService(IApplicationDbContext context) : IWorkspaceAccessService
{
    public async Task<WorkspaceAccess?> ResolveAsync(string tenantSlugOrId, string userId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(tenantSlugOrId)) return null;

        var key = tenantSlugOrId.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken);

        if (tenant == null) return null;

        if (!string.IsNullOrEmpty(userId) && tenant.OwnerId == userId)
        {
            return new WorkspaceAccess(tenant, userId, WorkspaceRole.Owner);
        }

        var membership = string.IsNullOrEmpty(userId)
            ? null
            : await context.StaffMembers
                .Where(s => s.TenantId == tenant.Id && s.UserId == userId && s.Status == "Active")
                .Select(s => s.Role)
                .FirstOrDefaultAsync(cancellationToken);

        var role = membership switch
        {
            null => WorkspaceRole.None,
            "Admin" => WorkspaceRole.Admin,
            _ => WorkspaceRole.Staff
        };

        return new WorkspaceAccess(tenant, userId ?? string.Empty, role);
    }
}
