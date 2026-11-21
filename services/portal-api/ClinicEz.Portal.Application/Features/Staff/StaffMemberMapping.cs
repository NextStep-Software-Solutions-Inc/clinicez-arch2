using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Domain.Entities;

namespace ClinicEz.Portal.Application.Features.Staff;

/// <summary>
/// The staff screens speak in one "role" string. This maps it to the workspace role (what a person may do in the
/// workspace) and an optional <see cref="StaffMember"/> job profile (what they do at a facility).
/// </summary>
public static class StaffMemberMapping
{
    public const string PendingInvitation = "PendingInvitation";

    /// <summary>Admin and Billing are workspace roles; anything else is a job role of an ordinary member.</summary>
    public static WorkspaceMemberRole WorkspaceRoleFor(string role) => role.Trim().ToLowerInvariant() switch
    {
        "admin" => WorkspaceMemberRole.Admin,
        "billing" or "biller" => WorkspaceMemberRole.Billing,
        _ => WorkspaceMemberRole.Member
    };

    /// <summary>A job profile is kept for job roles and for anyone tied to a facility.</summary>
    public static bool NeedsProfile(string role, Guid? facilityId) =>
        facilityId.HasValue || WorkspaceRoleFor(role) == WorkspaceMemberRole.Member;

    public static string StatusName(MemberStatus status, DateTime? expiresAt = null, DateTime? utcNow = null)
    {
        if (status == MemberStatus.Invited)
        {
            var now = utcNow ?? DateTime.UtcNow;
            if (expiresAt.HasValue && expiresAt.Value < now)
            {
                return "Expired";
            }
            return nameof(MemberStatus.Invited);
        }

        return status switch
        {
            MemberStatus.Suspended => nameof(MemberStatus.Suspended),
            MemberStatus.Revoked => nameof(MemberStatus.Revoked),
            _ => nameof(MemberStatus.Active)
        };
    }

    public static string RoleName(WorkspaceMember member, StaffMember? profile) =>
        profile is { Role: var job } && member.Role == WorkspaceMemberRole.Member ? job : member.Role.ToString();

    public static StaffMemberDto ToDto(WorkspaceMember member, StaffMember? profile, string? facilityName, DateTime? utcNow = null) => new(
        member.Id,
        member.UserId,
        member.Email,
        member.FullName,
        RoleName(member, profile),
        StatusName(member.Status, member.InvitationExpiresAt, utcNow),
        profile?.FacilityId,
        facilityName,
        member.JoinedAt,
        member.CreatedAt,
        member.InvitationToken,
        member.InvitationExpiresAt);
}
