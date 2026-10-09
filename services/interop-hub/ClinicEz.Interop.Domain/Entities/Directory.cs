using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Interop.Domain.Entities;

/// <summary>One facility in the hub directory read-model (fed by <c>directory.facility.upserted</c>).</summary>
public class HubFacility
{
    /// <summary><c>{TenantId}/{FacilityId}</c>: primary key and the key used in links and conversations.</summary>
    public string Key { get; private set; } = string.Empty;
    public string TenantId { get; private set; } = string.Empty;
    public string FacilityId { get; private set; } = string.Empty;
    public FacilityType FacilityType { get; set; }
    public string CellId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? BranchId { get; set; }
    public string? City { get; set; }
    public FacilityVisibility Visibility { get; set; } = FacilityVisibility.Private;
    public bool AcceptsExternalRequests { get; set; }
    public bool Active { get; set; } = true;
    public DateTime UpdatedAtUtc { get; set; }
    public long Version { get; set; }

    public HubFacility()
    {
    }

    public HubFacility(string tenantId, string facilityId)
    {
        TenantId = tenantId;
        FacilityId = facilityId;
        Key = MakeKey(tenantId, facilityId);
    }

    public static string MakeKey(string tenantId, string facilityId) => $"{tenantId}/{facilityId}";
}

/// <summary>A partner link between two facilities of different tenants (<c>directory.link.upserted</c>).</summary>
public class HubLink
{
    public Guid LinkId { get; set; }
    public string SourceTenantId { get; set; } = string.Empty;
    public string SourceFacilityId { get; set; } = string.Empty;
    public string TargetTenantId { get; set; } = string.Empty;
    public string TargetFacilityId { get; set; } = string.Empty;
    public LinkStatus Status { get; set; }
    public LinkScopes Scopes { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public long Version { get; set; }

    public string SourceKey => HubFacility.MakeKey(SourceTenantId, SourceFacilityId);
    public string TargetKey => HubFacility.MakeKey(TargetTenantId, TargetFacilityId);
}

/// <summary>
/// Remembers that <c>FromKey</c> addressed <c>ToKey</c> within one correlation, so <c>ToKey</c> may always
/// reply on that correlation (in-flight workflows survive a later link revocation).
/// Party keys: <c>tenant/facility</c> for facilities.
/// </summary>
public class HubConversation
{
    public long Id { get; set; }
    public Guid CorrelationId { get; set; }
    public string FromKey { get; set; } = string.Empty;
    public string ToKey { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
}

/// <summary>Small key/value counters: the directory version and the local snapshot cursor.</summary>
public class HubState
{
    public string Key { get; set; } = string.Empty;
    public long Value { get; set; }
    public DateTime UpdatedAtUtc { get; set; }

    public const string DirectoryVersion = "directory.version";
    public const string SnapshotCursor = "directory.snapshot.cursor";
}
