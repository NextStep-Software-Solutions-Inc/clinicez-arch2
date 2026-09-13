using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Organizations.Queries.GetOrganizationRoles;

public sealed record GetOrganizationRolesQuery(Guid OrganizationId) : IRequest<IReadOnlyList<OrganizationRoleDto>>;
