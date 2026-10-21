using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

/// <summary>
/// Service contract for validating Cloudflare Turnstile bot protection tokens.
/// </summary>
public interface ITurnstileValidator
{
    /// <summary>
    /// Validates the provided challenge token against the Cloudflare siteverify endpoint.
    /// </summary>
    /// <param name="token">The response token received from the client-side widget.</param>
    /// <param name="remoteIp">Optional remote client IP address.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>True if the token is valid, or if verification is globally disabled in the environment; false otherwise.</returns>
    Task<bool> ValidateAsync(string? token, string? remoteIp = null, CancellationToken ct = default);
}
