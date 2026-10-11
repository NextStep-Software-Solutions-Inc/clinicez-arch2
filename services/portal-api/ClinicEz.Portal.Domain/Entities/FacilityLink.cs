using System;
using ClinicEz.Portal.Domain.Common;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Directional cross-tenant link: the source (requester) may route <see cref="Scopes"/> work to the target; results flow back.
/// The id is the deterministic hub link id (<c>DirectoryPayloads.LinkId(source, target)</c>) so portal and hub agree on it.
/// </summary>
public class FacilityLink : BaseEntity
{
    public Guid SourceFacilityId { get; set; }
    public Facility SourceFacility { get; set; } = null!;
    public Guid SourceTenantId { get; set; }

    public Guid TargetFacilityId { get; set; }
    public Facility TargetFacility { get; set; } = null!;
    public Guid TargetTenantId { get; set; }

    public LinkStatus Status { get; set; } = LinkStatus.Pending;
    public LinkScopes Scopes { get; set; } = LinkScopes.All;

    public string RequestedBy { get; set; } = string.Empty;
    public string? ApprovedBy { get; set; }
}
