using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Organizations.Commands.JoinOrganization;

public sealed record JoinOrganizationCommand(
    Guid PatientId,
    Guid? OrganizationId,
    string? InviteCode,
    string RoleId,
    bool ConsentPrivacyPolicy,
    bool ConsentTermsAndConditions,
    bool ConsentDataSharing) : IRequest<OrganizationMembershipDto>;
