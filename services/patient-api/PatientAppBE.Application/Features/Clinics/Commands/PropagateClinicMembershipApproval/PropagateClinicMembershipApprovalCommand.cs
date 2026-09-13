using MediatR;
using System;

namespace PatientAppBE.Application.Features.Clinics.Commands.PropagateClinicMembershipApproval;

public sealed record PropagateClinicMembershipApprovalCommand(
    Guid ClinicId,
    Guid MembershipId,
    bool Approve) : IRequest<bool>;
