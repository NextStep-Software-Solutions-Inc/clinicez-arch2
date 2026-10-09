using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Interop.Application.Directory;

/// <summary>
/// The directory read-model: fed by the control plane (<c>directory.*</c> envelopes or the admin API), queried by facilities
/// (<c>GET /v1/directory/facilities</c>) and mirrored read-only to edge cells (<c>GET /v1/directory/snapshot</c>).
/// </summary>
public sealed class DirectoryService(IDirectoryStore store)
{
    /// <summary>Applies one <c>directory.*</c> envelope. Returns null when applied, otherwise a rejection reason.</summary>
    public async Task<string?> ApplyFeedAsync(InteropEnvelope envelope, CancellationToken ct)
    {
        try
        {
            switch (envelope.Type)
            {
                case InteropTypes.DirectoryCellUpserted:
                    return await UpsertCellAsync(envelope.GetPayload<DirectoryCellUpsertedPayload>(), ct);
                case InteropTypes.DirectoryFacilityUpserted:
                    return await UpsertFacilityAsync(envelope.GetPayload<DirectoryFacilityUpsertedPayload>(), ct);
                case InteropTypes.DirectoryLinkUpserted:
                    return await UpsertLinkAsync(envelope.GetPayload<DirectoryLinkUpsertedPayload>(), ct);
                default:
                    return $"Unknown hub message type '{envelope.Type}'.";
            }
        }
        catch (System.Text.Json.JsonException ex)
        {
            return $"Invalid {envelope.Type} payload: {ex.Message}";
        }
        catch (InvalidOperationException ex)
        {
            return $"Invalid {envelope.Type} payload: {ex.Message}";
        }
    }

    public async Task<string?> UpsertCellAsync(DirectoryCellUpsertedPayload cell, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(cell.CellId) || cell.CellId.Contains(':'))
            return "CellId is required and must not contain ':'.";
        if (cell.Kind == CellKind.Edge && string.IsNullOrWhiteSpace(cell.TenantId))
            return "An edge cell requires a TenantId.";
        await store.UpsertCellAsync(cell, ct);
        return null;
    }

    public async Task<string?> UpsertFacilityAsync(DirectoryFacilityUpsertedPayload facility, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(facility.TenantId) || string.IsNullOrWhiteSpace(facility.FacilityId) || string.IsNullOrWhiteSpace(facility.CellId))
            return "TenantId, FacilityId and CellId are required.";
        await store.UpsertFacilityAsync(facility, ct);
        return null;
    }

    public async Task<string?> UpsertLinkAsync(DirectoryLinkUpsertedPayload link, CancellationToken ct)
    {
        if (link.LinkId == Guid.Empty
            || string.IsNullOrWhiteSpace(link.SourceTenantId) || string.IsNullOrWhiteSpace(link.SourceFacilityId)
            || string.IsNullOrWhiteSpace(link.TargetTenantId) || string.IsNullOrWhiteSpace(link.TargetFacilityId))
            return "LinkId and both facility references are required.";
        await store.UpsertLinkAsync(link, ct);
        return null;
    }

    /// <summary>
    /// Facilities the caller may see: its own workspace, Network facilities it has an Active link to, and Public ones.
    /// The caller's workspace is derived from its client (the facilities of its cell); a cell hosting several tenants
    /// (the cloud cell) must say which one via <paramref name="tenantId"/>, which must belong to that cell.
    /// </summary>
    public async Task<IReadOnlyList<DirectoryFacilityDto>> ListAsync(
        HubPrincipal caller, string? tenantId, FacilityType? type, string? search, string? city, CancellationToken ct)
    {
        var viewer = await ResolveViewerAsync(caller, tenantId, ct);
        var visible = await store.QueryAsync(new DirectoryQuery(viewer, type, search, city), ct);
        return visible
            .Select(v => new DirectoryFacilityDto(
                v.Facility.TenantId,
                v.Facility.FacilityId,
                v.Facility.FacilityType,
                v.Facility.DisplayName,
                v.Facility.City,
                v.Facility.Visibility,
                v.Facility.AcceptsExternalRequests,
                v.IsOwnWorkspace,
                v.LinkStatus))
            .ToList();
    }

    private async Task<IReadOnlyCollection<string>?> ResolveViewerAsync(HubPrincipal caller, string? tenantId, CancellationToken ct)
    {
        switch (caller.Kind)
        {
            case HubClientKind.ControlPlane:
                return string.IsNullOrWhiteSpace(tenantId) ? null : [tenantId];
            case HubClientKind.PatientPlane:
                return [];
        }

        var cellTenants = await store.GetTenantsOfCellAsync(caller.CellId, ct);
        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            if (!cellTenants.Contains(tenantId, StringComparer.Ordinal))
                throw HubRequestException.Forbidden($"Tenant '{tenantId}' does not belong to this client's cell.");
            return [tenantId];
        }

        if (cellTenants.Count == 1) return [cellTenants[0]];
        throw HubRequestException.BadRequest("tenantId (or the X-Hub-Tenant header) is required for a cell that hosts several tenants.");
    }

    /// <summary>Snapshot for an edge cell's local hub. Cloud mode only; <paramref name="sinceVersion"/> is a cache validator.</summary>
    public async Task<DirectorySnapshotDto> GetSnapshotAsync(HubPrincipal caller, long sinceVersion, CancellationToken ct)
    {
        if (caller.Kind != HubClientKind.EdgeCell) throw HubRequestException.Forbidden("Only edge-cell clients can read the directory snapshot.");

        var version = await store.GetVersionAsync(ct);
        if (sinceVersion > 0 && sinceVersion >= version)
            return new DirectorySnapshotDto(version, true, [], [], []);

        var tenants = await store.GetTenantsOfCellAsync(caller.CellId, ct);
        return await store.BuildSnapshotAsync(tenants, caller.CellId, ct);
    }
}
