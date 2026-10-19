using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

public enum OwnershipTransferStatus
{
    Pending,
    Accepted,
    Declined,
    Cancelled,
    Expired
}

/// <summary>Two-step ownership hand-over: the owner offers, the target (an active member who owns no workspace) accepts.</summary>
public class OwnershipTransfer : BaseEntity
{
    public static readonly TimeSpan OfferLifetime = TimeSpan.FromDays(7);

    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public Guid TargetMemberId { get; set; }
    public WorkspaceMember TargetMember { get; set; } = null!;

    public string OfferedByUserId { get; set; } = string.Empty;
    public OwnershipTransferStatus Status { get; set; } = OwnershipTransferStatus.Pending;
    public DateTime ExpiresAt { get; set; }
    public DateTime? ResolvedAt { get; set; }

    public bool IsOpen(DateTime utcNow) => Status == OwnershipTransferStatus.Pending && ExpiresAt > utcNow;
}
