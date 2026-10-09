using ClinicEz.Portal.Application.Features.Integrations;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace ClinicEz.Portal.Api.Auth;

/// <summary>
/// Authenticates the read-only integration endpoints with a workspace API key sent in <c>X-Api-Key</c>.
/// It only runs for endpoints that name the <see cref="SchemeName"/> scheme, so it can never be used to
/// reach the Clerk-protected dashboard API. The principal carries the tenant and the key's scopes.
/// </summary>
public class ApiKeyAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IApiKeyValidator validator) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "ApiKey";
    public const string HeaderName = "X-Api-Key";
    public const string TenantIdClaim = "tenant_id";
    public const string TenantSlugClaim = "tenant_slug";
    public const string ScopeClaim = "scope";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(HeaderName, out var header) || string.IsNullOrWhiteSpace(header))
        {
            return AuthenticateResult.NoResult();
        }

        var identity = await validator.ValidateAsync(header.ToString(), Context.RequestAborted);
        if (identity == null) return AuthenticateResult.Fail("Invalid API key.");

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, $"apikey:{identity.KeyId}"),
            new(TenantIdClaim, identity.TenantId.ToString()),
            new(TenantSlugClaim, identity.TenantSlug)
        };
        claims.AddRange(identity.Scopes.Select(s => new Claim(ScopeClaim, s)));

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        return AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName));
    }
}
