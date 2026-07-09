using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Organizations.Queries.GetOrganizationRoles;

public sealed class GetOrganizationRolesQueryHandler
    : IRequestHandler<GetOrganizationRolesQuery, IReadOnlyList<OrganizationRoleDto>>
{
    private readonly IOrganizationRepository _repo;

    public GetOrganizationRolesQueryHandler(IOrganizationRepository repo) => _repo = repo;

    public async Task<IReadOnlyList<OrganizationRoleDto>> Handle(
        GetOrganizationRolesQuery request, CancellationToken cancellationToken)
    {
        var roles = await _repo.GetRolesAsync(request.OrganizationId, cancellationToken);
        return roles.Select(r => new OrganizationRoleDto(
            r.Id, r.OrganizationId, r.RoleId, r.Name, r.Description)).ToList().AsReadOnly();
    }
}
