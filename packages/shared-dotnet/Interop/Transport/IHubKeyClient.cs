using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Shared.Interop.Transport;

/// <summary>
/// Optional capability of a hub connection: look up the public signing key registered for a hub client
/// (<c>GET /v1/keys/{clientId}</c>). Implemented by <see cref="HubHttpClient"/>; the in-process test hub does not sign.
/// </summary>
public interface IHubKeyClient
{
    /// <summary>The signer's key record, or null when the hub does not know that client.</summary>
    Task<HubSignerKey?> GetSignerKeyAsync(string clientId, CancellationToken ct);
}
