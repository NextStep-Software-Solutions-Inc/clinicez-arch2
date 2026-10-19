namespace ClinicEz.Portal.Application.Features.Hub;

/// <param name="Cells">Cell upserts queued (the cloud cell plus one per on-premise tenant).</param>
/// <param name="Facilities">Facility upserts queued, including deleted/suspended ones (sent as inactive so the hub drops them).</param>
/// <param name="Links">Automatic same-branch link upserts queued.</param>
public sealed record HubResyncResult(int Cells, int Facilities, int Links);

/// <summary>
/// Recovery tool: re-enqueues the full directory (cells, facilities, links) to the hub. Every message is an upsert,
/// so running it repeatedly is safe; use it after the hub's directory was reset or restored from a backup.
/// </summary>
public interface IHubDirectoryResyncService
{
    Task<HubResyncResult> ResyncAsync(CancellationToken cancellationToken);
}
