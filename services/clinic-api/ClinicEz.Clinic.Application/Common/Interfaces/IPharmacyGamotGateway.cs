using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>What the pharmacy answered, relayed unchanged to the clinic app.</summary>
public sealed record GamotGatewayResult(int StatusCode, string? ContentType, string Body);

/// <summary>
/// Reaches the pharmacy's GAMOT endpoints on behalf of a signed-in clinic user. The browser or phone never talks to the
/// pharmacy directly: the clinic API asks it through the interop hub (request/reply), so no pharmacy address or service
/// key is configured and the pharmacy answers only for senders of its own tenant.
/// </summary>
public interface IPharmacyGamotGateway
{
    /// <param name="relativePath">Path under <c>api/v1/gamot/</c>, e.g. <c>formulary</c> or <c>ledger/1234</c>.</param>
    /// <param name="queryString">Raw query string including the leading <c>?</c>, or empty.</param>
    /// <param name="jsonBody">Request body for POSTs.</param>
    Task<GamotGatewayResult> SendAsync(
        string method,
        string relativePath,
        string queryString,
        string? jsonBody,
        CancellationToken ct);
}
