using MediatR;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Features.Organizations.Queries.GetOrganizationByInviteCode;

public sealed class GetOrganizationByInviteCodeQueryHandler
    : IRequestHandler<GetOrganizationByInviteCodeQuery, OrganizationDetailDto?>
{
    private readonly IOrganizationRepository _repo;
    public GetOrganizationByInviteCodeQueryHandler(IOrganizationRepository repo) => _repo = repo;

    public async Task<OrganizationDetailDto?> Handle(
        GetOrganizationByInviteCodeQuery request, CancellationToken cancellationToken)
    {
        var org = await _repo.GetByInviteCodeAsync(request.InviteCode, cancellationToken);
        if (org is null) return null;

        var clinics = org.ClinicLinks
            .Where(l => l.IsActive)
            .Select(l => new ClinicSummaryDto(
                l.Clinic.Id, l.Clinic.Name, l.Clinic.Description, l.Clinic.Address,
                l.Clinic.IsPublic, l.Clinic.SupportsAppointments,
                l.Clinic.LogoUrl, l.Clinic.CoverImageUrl,
                l.Clinic.SpecialtiesJson, l.Clinic.RequiredShareFieldsJson, l.Clinic.FeaturedScore, l.Clinic.ActiveMemberCount))
            .ToList().AsReadOnly();

        return new OrganizationDetailDto(
            org.Id, org.Slug, org.Name, org.Description, org.IsPublic,
            org.LogoUrl, org.CoverImageUrl, org.AddressHint,
            org.PrivacyPolicyUrl, org.TermsAndConditionsUrl,
            org.RequiredShareFieldsJson, org.RolesJson,
            org.FeaturedScore, org.ActiveMemberCount, clinics);
    }
}
