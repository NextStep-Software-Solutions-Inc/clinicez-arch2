using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Organizations.Queries.GetOrganizationRoles;

public sealed record GetOrganizationRolesQuery(Guid OrganizationId) : IRequest<IReadOnlyList<OrganizationRoleDto>>;
