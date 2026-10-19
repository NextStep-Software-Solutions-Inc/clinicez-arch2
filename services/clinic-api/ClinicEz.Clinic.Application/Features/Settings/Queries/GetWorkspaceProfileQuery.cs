using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Workspace;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Settings.Queries;

/// <summary>
/// The workspace-level brand and regional defaults this facility inherits (null when the portal has
/// never been reachable for this tenant). Served from the cached, ETag-revalidated provider.
/// </summary>
public sealed record GetWorkspaceProfileQuery : IRequest<WorkspaceProfile?>;

public sealed class GetWorkspaceProfileQueryHandler(IClinicContext clinicContext, IWorkspaceProfileProvider provider)
    : IRequestHandler<GetWorkspaceProfileQuery, WorkspaceProfile?>
{
    public Task<WorkspaceProfile?> Handle(GetWorkspaceProfileQuery request, CancellationToken ct) =>
        provider.GetAsync(clinicContext.TenantId.ToString(), ct);
}
