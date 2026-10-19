using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Clinics.Queries.SearchClinics;

public sealed class SearchClinicsQueryHandler
    : IRequestHandler<SearchClinicsQuery, DiscoveryPagedDto<ClinicSummaryDto>>
{
    private readonly IClinicRepository _repo;
    private readonly IClinicMembershipRepository _membershipRepo;

    public SearchClinicsQueryHandler(IClinicRepository repo, IClinicMembershipRepository membershipRepo)
    {
        _repo = repo;
        _membershipRepo = membershipRepo;
    }

    public async Task<DiscoveryPagedDto<ClinicSummaryDto>> Handle(
        SearchClinicsQuery request, CancellationToken cancellationToken)
    {
        var items = request.OrganizationId.HasValue
            ? await _repo.GetByOrganizationAsync(request.OrganizationId.Value, cancellationToken)
            : await _repo.SearchAsync(request.Query, request.Skip, request.Take, cancellationToken);

        var total = request.OrganizationId.HasValue
            ? items.Count
            : await _repo.CountAsync(request.Query, cancellationToken);

        IReadOnlyList<ClinicEz.Patient.Domain.Entities.ClinicMembership> userMemberships = new List<ClinicEz.Patient.Domain.Entities.ClinicMembership>();
        if (request.ForPatientId.HasValue)
        {
            userMemberships = await _membershipRepo.GetByPatientAsync(request.ForPatientId.Value, cancellationToken);
        }

        return new DiscoveryPagedDto<ClinicSummaryDto>(
            items.Take(request.Take).Select(c => 
            {
                var membership = userMemberships.FirstOrDefault(m => m.ClinicId == c.Id);
                var isGated = c.IsGated;
                var isUnlocked = !isGated || (membership != null && membership.Status == ClinicEz.Patient.Domain.Enums.ClinicMembershipStatus.Active);
                return new ClinicSummaryDto(
                    c.Id, c.Name, c.Description, c.Address, c.IsPublic, c.SupportsAppointments,
                    c.LogoUrl, c.CoverImageUrl, c.SpecialtiesJson, c.RequiredShareFieldsJson, c.FeaturedScore, c.ActiveMemberCount,
                    membership?.Status.ToString(),
                    isGated,
                    isUnlocked
                );
            }).ToList().AsReadOnly(), total, request.Skip, request.Take);
    }
}
