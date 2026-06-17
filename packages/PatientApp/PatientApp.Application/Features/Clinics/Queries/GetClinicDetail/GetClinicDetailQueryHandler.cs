using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Clinics.Queries.GetClinicDetail;

public sealed class GetClinicDetailQueryHandler
    : IRequestHandler<GetClinicDetailQuery, ClinicDetailDto?>
{
    private readonly IClinicRepository _clinicRepo;
    private readonly IClinicMembershipRepository _membershipRepo;

    public GetClinicDetailQueryHandler(
        IClinicRepository clinicRepo, IClinicMembershipRepository membershipRepo)
    {
        _clinicRepo = clinicRepo;
        _membershipRepo = membershipRepo;
    }

    public async Task<ClinicDetailDto?> Handle(GetClinicDetailQuery request, CancellationToken cancellationToken)
    {
        var clinic = await _clinicRepo.GetByIdAsync(request.ClinicId, cancellationToken);
        if (clinic is null) return null;

        string? membershipStatus = null;
        if (request.ForPatientId.HasValue)
        {
            var membership = await _membershipRepo.GetByPatientAndClinicAsync(
                request.ForPatientId.Value, request.ClinicId, cancellationToken);
            membershipStatus = membership?.Status.ToString();
        }

        var linkedOrgs = clinic.OrganizationLinks
            .Where(l => l.IsActive)
            .Select(l => new OrganizationSummaryDto(
                l.Organization.Id, l.Organization.Slug, l.Organization.Name,
                l.Organization.Description, l.Organization.IsPublic,
                l.Organization.LogoUrl, l.Organization.CoverImageUrl, l.Organization.AddressHint,
                l.Organization.FeaturedScore, l.Organization.ActiveMemberCount,
                l.Organization.RequiredShareFieldsJson, l.Organization.RolesJson))
            .ToList().AsReadOnly();

        return new ClinicDetailDto(
            clinic.Id, clinic.Name, clinic.Description, clinic.Address,
            clinic.IsPublic, clinic.SupportsAppointments, clinic.BaseUrl,
            clinic.LogoUrl, clinic.CoverImageUrl, clinic.PrivacyPolicyUrl,
            clinic.TermsAndConditionsUrl, clinic.SpecialtiesJson,
            clinic.RequiredShareFieldsJson, clinic.FeaturedScore,
            linkedOrgs, membershipStatus);
    }
}
