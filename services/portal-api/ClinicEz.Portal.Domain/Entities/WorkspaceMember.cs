using System;
using System.Text.Json.Serialization;
using ClinicEz.Portal.Domain.Common;
using ClinicEz.Shared.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>What a person may do in the workspace itself (separate from any job role at a facility).</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum WorkspaceMemberRole
{
    Member,
    Billing,
    Admin,
    Owner
}

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum MemberStatus
{
    Invited,
    Active,
    Suspended,
    Revoked
}

/// <summary>
/// A person's membership of one workspace. A user can be a member of many workspaces but own at most one
/// (see the Owner role and the unique owner index on <see cref="Tenant"/>). Accepting an invitation never grants
/// ownership. Facility job roles live in <see cref="StaffMember"/>.
/// </summary>
public class WorkspaceMember : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    /// <summary>Clerk user id; null until an invited person accepts.</summary>
    public string? UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public WorkspaceMemberRole Role { get; set; } = WorkspaceMemberRole.Member;
    public MemberStatus Status { get; set; } = MemberStatus.Active;

    public string? InvitationToken { get; set; }
    public DateTime? InvitationExpiresAt { get; set; }
    public DateTime? JoinedAt { get; set; }
}
