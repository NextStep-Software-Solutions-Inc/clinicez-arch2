using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Organizations.Queries.SearchOrganizations;

public sealed record SearchOrganizationsQuery(string? Query, Guid? ForPatientId, int Skip = 0, int Take = 20)
    : IRequest<DiscoveryPagedDto<OrganizationSummaryDto>>;
