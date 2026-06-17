using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Organizations.Queries.SearchOrganizations;

public sealed record SearchOrganizationsQuery(string? Query, int Skip = 0, int Take = 20)
    : IRequest<DiscoveryPagedDto<OrganizationSummaryDto>>;
