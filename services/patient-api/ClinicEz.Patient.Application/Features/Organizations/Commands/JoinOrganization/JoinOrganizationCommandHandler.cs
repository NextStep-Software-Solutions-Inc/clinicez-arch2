using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Application.Features.Organizations.Commands.JoinOrganization;

public sealed class JoinOrganizationCommandHandler
    : IRequestHandler<JoinOrganizationCommand, OrganizationMembershipDto>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IOrganizationRepository _orgRepo;
    private readonly IOrganizationMembershipRepository _membershipRepo;
    private readonly IUnitOfWork _uow;

    public JoinOrganizationCommandHandler(
        IPatientRepository patientRepo, IOrganizationRepository orgRepo,
        IOrganizationMembershipRepository membershipRepo, IUnitOfWork uow)
    {
        _patientRepo = patientRepo; _orgRepo = orgRepo;
        _membershipRepo = membershipRepo; _uow = uow;
    }

    public async Task<OrganizationMembershipDto> Handle(
        JoinOrganizationCommand request, CancellationToken cancellationToken)
    {
        if (!request.ConsentPrivacyPolicy)
            throw new ValidationException("Consent to the Organization Privacy Policy is required by data privacy regulations.");

        if (!request.ConsentTermsAndConditions)
            throw new ValidationException("Consent to the Organization Terms and Conditions is required.");

        if (!request.ConsentDataSharing)
            throw new ValidationException("Consent to health data sharing with this organization is required.");

        _ = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        Organization? org = null;
        if (request.OrganizationId.HasValue)
        {
            org = await _orgRepo.GetByIdAsync(request.OrganizationId.Value, cancellationToken);
            if (org is null)
                throw new NotFoundException($"Organization '{request.OrganizationId.Value}' was not found.");

            if (!org.IsPublic)
            {
                if (string.IsNullOrWhiteSpace(request.InviteCode))
                    throw new ValidationException("Invite code is required for private organizations.");

                if (org.InviteCode != request.InviteCode)
                    throw new ValidationException("The invite code is invalid for this organization.");
            }
        }
        else
        {
            if (string.IsNullOrWhiteSpace(request.InviteCode))
                throw new ValidationException("Invite code or organization ID must be provided.");

            org = await _orgRepo.GetByInviteCodeAsync(request.InviteCode, cancellationToken);
            if (org is null)
                throw new NotFoundException($"No organization found for invite code '{request.InviteCode}'.");
        }

        var roles = System.Text.Json.JsonSerializer.Deserialize<List<Dictionary<string, string>>>(org.RolesJson) ?? [];
        var role = roles.FirstOrDefault(r => r.TryGetValue("id", out var id) && id == request.RoleId)
            ?? roles.FirstOrDefault()
            ?? new Dictionary<string, string> { ["id"] = request.RoleId, ["name"] = request.RoleId };

        var existing = await _membershipRepo.GetByPatientAndOrgWithDeletedAsync(request.PatientId, org.Id, cancellationToken);
        if (existing is not null)
        {
            if (!existing.IsDeleted && (existing.Status == ClinicMembershipStatus.Active || existing.Status == ClinicMembershipStatus.Pending))
            {
                throw new ConflictException($"Already a member or request is pending for organization '{org.Name}'.");
            }

            if (existing.IsDeleted)
            {
                existing.IsDeleted = false;
                existing.DeletedAt = null;
                existing.DeletedBy = null;
            }

            existing.Status = ClinicMembershipStatus.Pending;
            existing.RoleId = request.RoleId;
            existing.RoleName = role.GetValueOrDefault("name", request.RoleId);
            existing.ConsentPrivacyPolicy = request.ConsentPrivacyPolicy;
            existing.ConsentTermsAndConditions = request.ConsentTermsAndConditions;
            existing.ConsentDataSharing = request.ConsentDataSharing;
            existing.ConsentedAt = DateTime.UtcNow;

            _membershipRepo.Update(existing);
            await _uow.SaveChangesAsync(cancellationToken);

            return new OrganizationMembershipDto(
                existing.Id, org.Id, org.Name,
                existing.RoleId, existing.RoleName, existing.Status.ToString(),
                existing.ConsentDataSharing, existing.ConsentedAt, existing.CreatedAt);
        }

        var membership = new OrganizationMembership
        {
            ClientId = Guid.NewGuid(),
            PatientId = request.PatientId,
            OrganizationId = org.Id,
            RoleId = request.RoleId,
            RoleName = role.GetValueOrDefault("name", request.RoleId),
            ConsentPrivacyPolicy = request.ConsentPrivacyPolicy,
            ConsentTermsAndConditions = request.ConsentTermsAndConditions,
            ConsentDataSharing = request.ConsentDataSharing,
            ConsentedAt = DateTime.UtcNow,
        };

        await _membershipRepo.AddAsync(membership, cancellationToken);
        await _uow.SaveChangesAsync(cancellationToken);

        return new OrganizationMembershipDto(
            membership.Id, org.Id, org.Name,
            membership.RoleId, membership.RoleName, membership.Status.ToString(),
            membership.ConsentDataSharing, membership.ConsentedAt, membership.CreatedAt);
    }
}
