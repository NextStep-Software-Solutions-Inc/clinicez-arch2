using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Organizations.Queries.SearchOrganizations;

public sealed class SearchOrganizationsQueryHandler
    : IRequestHandler<SearchOrganizationsQuery, DiscoveryPagedDto<OrganizationSummaryDto>>
{
    private readonly IOrganizationRepository _repo;
    public SearchOrganizationsQueryHandler(IOrganizationRepository repo) => _repo = repo;

    public async Task<DiscoveryPagedDto<OrganizationSummaryDto>> Handle(
        SearchOrganizationsQuery request, CancellationToken cancellationToken)
    {
        var items = await _repo.SearchAsync(request.Query, request.Skip, request.Take, cancellationToken);
        var total = await _repo.CountAsync(request.Query, cancellationToken);

        return new DiscoveryPagedDto<OrganizationSummaryDto>(
            items.Select(o => new OrganizationSummaryDto(
                o.Id, o.Slug, o.Name, o.Description, o.IsPublic,
                o.LogoUrl, o.CoverImageUrl, o.AddressHint,
                o.FeaturedScore, o.ActiveMemberCount,
                o.RequiredShareFieldsJson, o.RolesJson)).ToList().AsReadOnly(),
            total, request.Skip, request.Take);
    }
}
