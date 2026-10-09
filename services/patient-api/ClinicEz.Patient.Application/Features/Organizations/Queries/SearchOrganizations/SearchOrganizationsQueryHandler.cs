using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Organizations.Queries.SearchOrganizations;

public sealed class SearchOrganizationsQueryHandler
    : IRequestHandler<SearchOrganizationsQuery, DiscoveryPagedDto<OrganizationSummaryDto>>
{
    private readonly IOrganizationRepository _repo;
    private readonly IOrganizationMembershipRepository _membershipRepo;

    public SearchOrganizationsQueryHandler(IOrganizationRepository repo, IOrganizationMembershipRepository membershipRepo)
    {
        _repo = repo;
        _membershipRepo = membershipRepo;
    }

    public async Task<DiscoveryPagedDto<OrganizationSummaryDto>> Handle(
        SearchOrganizationsQuery request, CancellationToken cancellationToken)
    {
        var items = await _repo.SearchAsync(request.Query, request.Skip, request.Take, cancellationToken);
        var total = await _repo.CountAsync(request.Query, cancellationToken);

        IReadOnlyList<ClinicEz.Patient.Domain.Entities.OrganizationMembership> userMemberships = new List<ClinicEz.Patient.Domain.Entities.OrganizationMembership>();
        if (request.ForPatientId.HasValue)
        {
            userMemberships = await _membershipRepo.GetByPatientAsync(request.ForPatientId.Value, cancellationToken);
        }

        return new DiscoveryPagedDto<OrganizationSummaryDto>(
            items.Take(request.Take).Select(o => 
            {
                var membership = userMemberships.FirstOrDefault(m => m.OrganizationId == o.Id);
                return new OrganizationSummaryDto(
                    o.Id, o.Slug, o.Name, o.Description, o.IsPublic,
                    o.LogoUrl, o.CoverImageUrl, o.AddressHint,
                    o.FeaturedScore, o.ActiveMemberCount,
                    o.RequiredShareFieldsJson, o.RolesJson,
                    membership?.Status.ToString()
                );
            }).ToList().AsReadOnly(),
            total, request.Skip, request.Take);
    }
}
