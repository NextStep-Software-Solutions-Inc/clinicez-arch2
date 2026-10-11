using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

/// <summary>
/// Mirrors a user's workspace facts (the one workspace they own and the workspaces they belong to) into their
/// identity-provider public metadata so the website and API gateways can read them without a database call.
/// The database stays the source of truth; the mirror is best effort and never fails the caller.
/// </summary>
public interface IClerkMetadataSync
{
    /// <summary>Recomputes <c>ownedTenantId</c> and <c>memberships</c> for the user from the database and writes them.</summary>
    Task SyncAsync(string userId, CancellationToken cancellationToken);
}
