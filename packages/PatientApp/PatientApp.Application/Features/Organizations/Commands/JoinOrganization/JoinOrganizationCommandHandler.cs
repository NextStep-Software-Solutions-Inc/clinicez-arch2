using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Common.Errors;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Organizations.Commands.JoinOrganization;

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
        _ = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var org = await _orgRepo.GetByInviteCodeAsync(request.InviteCode, cancellationToken)
            ?? throw new NotFoundException($"No organization found for invite code '{request.InviteCode}'.");

        var existing = await _membershipRepo.GetByPatientAndOrgAsync(request.PatientId, org.Id, cancellationToken);
        if (existing is not null)
            throw new ConflictException($"Already a member of organization '{org.Name}'.");

        var roles = System.Text.Json.JsonSerializer.Deserialize<List<Dictionary<string, string>>>(org.RolesJson) ?? [];
        var role = roles.FirstOrDefault(r => r.TryGetValue("id", out var id) && id == request.RoleId)
            ?? roles.FirstOrDefault()
            ?? new Dictionary<string, string> { ["id"] = request.RoleId, ["name"] = request.RoleId };

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
