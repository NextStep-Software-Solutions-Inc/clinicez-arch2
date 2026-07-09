using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Organizations.Queries.GetOrganizationRoles;

public sealed record GetOrganizationRolesQuery(Guid OrganizationId) : IRequest<IReadOnlyList<OrganizationRoleDto>>;
