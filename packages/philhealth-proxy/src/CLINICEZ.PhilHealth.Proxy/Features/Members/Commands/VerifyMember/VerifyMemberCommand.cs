using MediatR;

namespace CLINICEZ.PhilHealth.Proxy.Features.Members.Commands.VerifyMember;

/// <summary>
/// Verifies that a PhilHealth Identification Number belongs to the member with the supplied name.
/// </summary>
public sealed record VerifyMemberCommand(
    string PhilHealthNumber,
    string LastName,
    string FirstName,
    string? DateOfBirth
) : IRequest<bool>;
