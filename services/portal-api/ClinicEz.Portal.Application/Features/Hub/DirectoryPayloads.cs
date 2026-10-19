using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Portal.Application.Features.Hub;

/// <summary>Cell model: one shared cloud cell, plus one edge cell per on-premise tenant site.</summary>
public static class FacilityCells
{
    public const string DefaultCloudCellId = "cloud";
    public const string EdgeCellPrefix = "edge-";

    public static string EdgeCellId(Guid tenantId) => $"{EdgeCellPrefix}{tenantId:D}";

    public static string ResolveCellId(FacilityDeploymentMode mode, Guid tenantId, string cloudCellId) =>
        mode == FacilityDeploymentMode.OnPremise ? EdgeCellId(tenantId) : cloudCellId;

    public static string ResolveCellId(Facility facility, string cloudCellId) =>
        string.IsNullOrWhiteSpace(facility.CellId)
            ? ResolveCellId(facility.DeploymentMode, facility.TenantId, cloudCellId)
            : facility.CellId;

    /// <summary>Hosting that needs a hub client of its own (an on-premise site).</summary>
    public static bool RequiresHubClient(Facility facility) => facility.DeploymentMode == FacilityDeploymentMode.OnPremise;

    public static bool IsEdgeCell(string cellId) => cellId.StartsWith(EdgeCellPrefix, StringComparison.Ordinal);

    /// <summary>
    /// A facility is routable (can receive messages) while it is provisioning or active. A provisioning facility
    /// must already be routable: its licence is delivered to it over the hub.
    /// </summary>
    public static bool IsRoutable(Facility facility) =>
        !facility.IsDeleted && facility.Status is FacilityStatus.Provisioning or FacilityStatus.Active;
}

/// <summary>Maps portal entities to the hub directory payloads.</summary>
public static class DirectoryPayloads
{
    public static DirectoryCellUpsertedPayload CloudCell(string cloudCellId) => new()
    {
        CellId = cloudCellId,
        Name = "Clinic EZ Cloud",
        Kind = CellKind.Cloud,
        Active = true
    };

    public static DirectoryCellUpsertedPayload EdgeCell(Tenant tenant) => new()
    {
        CellId = FacilityCells.EdgeCellId(tenant.Id),
        Name = $"{tenant.Name} (on-premise)",
        Kind = CellKind.Edge,
        TenantId = tenant.Id.ToString(),
        Active = true
    };

    public static DirectoryFacilityUpsertedPayload Facility(Facility facility, string cloudCellId) => new()
    {
        TenantId = facility.TenantId.ToString(),
        FacilityId = facility.Id.ToString(),
        FacilityType = facility.FacilityType,
        CellId = FacilityCells.ResolveCellId(facility, cloudCellId),
        DisplayName = facility.Name,
        BranchId = facility.BranchId?.ToString(),
        City = facility.City,
        Visibility = facility.Visibility,
        AcceptsExternalRequests = facility.AcceptsExternalRequests,
        Active = FacilityCells.IsRoutable(facility)
    };

    /// <summary>Stable id so that re-sending a link updates it instead of creating a duplicate.</summary>
    public static Guid LinkId(Guid sourceFacilityId, Guid targetFacilityId)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes($"facility-link:{sourceFacilityId:N}>{targetFacilityId:N}"));
        return new Guid(hash.AsSpan(0, 16));
    }

    public static DirectoryLinkUpsertedPayload SameTenantLink(Facility source, Facility target, LinkStatus status) => new()
    {
        LinkId = LinkId(source.Id, target.Id),
        SourceTenantId = source.TenantId.ToString(),
        SourceFacilityId = source.Id.ToString(),
        TargetTenantId = target.TenantId.ToString(),
        TargetFacilityId = target.Id.ToString(),
        Status = status,
        Scopes = LinkScopes.All
    };
}
