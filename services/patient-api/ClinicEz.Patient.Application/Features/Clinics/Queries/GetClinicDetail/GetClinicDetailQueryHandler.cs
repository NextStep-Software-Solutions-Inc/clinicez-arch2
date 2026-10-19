using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Patient.Application.Features.Clinics.Queries.GetClinicDetail;

public sealed class GetClinicDetailQueryHandler
    : IRequestHandler<GetClinicDetailQuery, ClinicDetailDto?>
{
    private readonly IClinicRepository _clinicRepo;
    private readonly IClinicMembershipRepository _membershipRepo;
    private readonly IOrganizationMembershipRepository _orgMembershipRepo;

    public GetClinicDetailQueryHandler(
        IClinicRepository clinicRepo,
        IClinicMembershipRepository membershipRepo,
        IOrganizationMembershipRepository orgMembershipRepo)
    {
        _clinicRepo = clinicRepo;
        _membershipRepo = membershipRepo;
        _orgMembershipRepo = orgMembershipRepo;
    }

    public async Task<ClinicDetailDto?> Handle(GetClinicDetailQuery request, CancellationToken cancellationToken)
    {
        var clinic = await _clinicRepo.GetByIdAsync(request.ClinicId, cancellationToken);
        if (clinic is null) return null;

        var isGated = clinic.IsGated;
        var isUnlocked = !isGated;

        string? membershipStatus = null;
        if (request.ForPatientId.HasValue)
        {
            var membership = await _membershipRepo.GetByPatientAndClinicAsync(
                request.ForPatientId.Value, request.ClinicId, cancellationToken);
            membershipStatus = membership?.Status.ToString();

            if (isGated)
            {
                // Check direct active membership
                if (membership != null && membership.Status == ClinicMembershipStatus.Active)
                {
                    isUnlocked = true;
                }
                else
                {
                    // Check active membership in any linked organization
                    var linkedOrgIds = clinic.OrganizationLinks
                        .Where(l => l.IsActive)
                        .Select(l => l.OrganizationId)
                        .ToHashSet();

                    if (linkedOrgIds.Count > 0)
                    {
                        var orgMemberships = await _orgMembershipRepo.GetByPatientAsync(
                            request.ForPatientId.Value, cancellationToken);
                        if (orgMemberships.Any(m => m.Status == ClinicMembershipStatus.Active && linkedOrgIds.Contains(m.OrganizationId)))
                        {
                            isUnlocked = true;
                        }
                    }
                }
            }
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

        var providers = clinic.HealthcareProviders
            .Where(p => p.IsActive)
            .OrderBy(p => p.DisplayOrder)
            .Select(p => new ClinicHealthcareProviderDto(
                p.Id, p.Name, p.Specialty, p.AvatarUrl, p.ProfessionalLicenseNo))
            .ToList().AsReadOnly();

        IReadOnlyList<ClinicServiceDto> services = isUnlocked
            ? clinic.Services
                .Where(s => s.IsActive)
                .OrderBy(s => s.DisplayOrder)
                .Select(s => new ClinicServiceDto(
                    s.Id, s.Name, s.Description, s.DurationMinutes, s.Price))
                .ToList().AsReadOnly()
            : Array.Empty<ClinicServiceDto>();

        return new ClinicDetailDto(
            clinic.Id, clinic.Name, clinic.Description, clinic.Address,
            clinic.IsPublic, clinic.SupportsAppointments,
            clinic.LogoUrl, clinic.CoverImageUrl, clinic.PrivacyPolicyUrl,
            clinic.TermsAndConditionsUrl, clinic.SpecialtiesJson,
            clinic.RequiredShareFieldsJson, clinic.FeaturedScore,
            clinic.ActiveMemberCount, providers, services, linkedOrgs, membershipStatus,
            isGated, isUnlocked);
    }
}
