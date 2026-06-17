using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Clinics.Queries.SearchClinics;

public sealed class SearchClinicsQueryHandler
    : IRequestHandler<SearchClinicsQuery, DiscoveryPagedDto<ClinicSummaryDto>>
{
    private readonly IClinicRepository _repo;
    public SearchClinicsQueryHandler(IClinicRepository repo) => _repo = repo;

    public async Task<DiscoveryPagedDto<ClinicSummaryDto>> Handle(
        SearchClinicsQuery request, CancellationToken cancellationToken)
    {
        var items = request.OrganizationId.HasValue
            ? await _repo.GetByOrganizationAsync(request.OrganizationId.Value, cancellationToken)
            : await _repo.SearchAsync(request.Query, request.Skip, request.Take, cancellationToken);

        var total = request.OrganizationId.HasValue
            ? items.Count
            : await _repo.CountAsync(request.Query, cancellationToken);

        return new DiscoveryPagedDto<ClinicSummaryDto>(
            items.Take(request.Take).Select(c => new ClinicSummaryDto(
                c.Id, c.Name, c.Description, c.Address, c.IsPublic, c.SupportsAppointments,
                c.LogoUrl, c.CoverImageUrl, c.SpecialtiesJson, c.RequiredShareFieldsJson, c.FeaturedScore))
            .ToList().AsReadOnly(), total, request.Skip, request.Take);
    }
}
