using MediatR;
using System;

namespace ClinicEz.Patient.Application.Features.Organizations.Commands.PropagateOrganizationMembershipApproval;

public sealed record PropagateOrganizationMembershipApprovalCommand(
    Guid OrganizationId,
    Guid MembershipId,
    bool Approve) : IRequest<bool>;
