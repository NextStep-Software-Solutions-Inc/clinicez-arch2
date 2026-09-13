using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Organizations.Queries.SearchOrganizations;

public sealed record SearchOrganizationsQuery(string? Query, Guid? ForPatientId, int Skip = 0, int Take = 20)
    : IRequest<DiscoveryPagedDto<OrganizationSummaryDto>>;
