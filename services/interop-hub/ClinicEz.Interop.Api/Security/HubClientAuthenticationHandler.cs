using System.Security.Claims;
using System.Text.Encodings.Web;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Api.Security;

/// <summary>
/// Authenticates the <c>X-Hub-Client</c> / <c>X-Hub-Secret</c> headers. No credentials or wrong credentials yield 401;
/// a valid client that is not allowed to do something gets 403 from the authorization policies.
/// </summary>
public sealed class HubClientAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    ClientAuthenticator authenticator) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "HubClient";
    public const string ControlPlanePolicy = "ControlPlane";

    private const string ClientClaim = "hub_client";
    private const string CellClaim = "hub_cell";
    private const string KindClaim = "hub_kind";
    private const string ServiceClaim = "hub_service";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(HubHttpClient.ClientIdHeader, out var clientId)
            || !Request.Headers.TryGetValue(HubHttpClient.ClientSecretHeader, out var secret))
            return AuthenticateResult.NoResult();

        var principal = await authenticator.AuthenticateAsync(clientId.ToString(), secret.ToString(), Context.RequestAborted);
        if (principal is null) return AuthenticateResult.Fail("Invalid hub credentials.");

        var identity = new ClaimsIdentity(
        [
            new Claim(ClientClaim, principal.ClientId),
            new Claim(CellClaim, principal.CellId),
            new Claim(KindClaim, principal.Kind.ToString()),
            new Claim(ServiceClaim, principal.Service)
        ], SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    public static bool IsControlPlane(ClaimsPrincipal user) => user.HasClaim(KindClaim, nameof(HubClientKind.ControlPlane));

    public static HubPrincipal ToHubPrincipal(ClaimsPrincipal user) => new(
        user.FindFirstValue(ClientClaim) ?? throw new InvalidOperationException("Not a hub client."),
        user.FindFirstValue(CellClaim)!,
        Enum.Parse<HubClientKind>(user.FindFirstValue(KindClaim)!),
        user.FindFirstValue(ServiceClaim)!);
}
