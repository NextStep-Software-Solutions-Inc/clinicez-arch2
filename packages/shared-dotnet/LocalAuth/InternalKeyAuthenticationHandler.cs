using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.LocalAuth;

public static class FacilityAuthSchemes
{
    public const string Facility = "Facility";
    public const string Internal = "Internal";
    public const string InternalKeyHeader = "X-Internal-Key";
    public const string InternalClaim = "internal_service";
}

/// <summary>
/// Authenticates trusted internal services (e.g. portal-api → clinic-api) with a shared secret presented in <c>X-Internal-Key</c>.
/// The key is compared in constant time. If <c>Internal:ApiKey</c> is not configured the scheme never authenticates.
/// </summary>
public sealed class InternalKeyAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly InternalKeyOptions _internalOptions;

    public InternalKeyAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IOptions<InternalKeyOptions> internalOptions)
        : base(options, logger, encoder)
    {
        _internalOptions = internalOptions.Value;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(FacilityAuthSchemes.InternalKeyHeader, out var provided) ||
            string.IsNullOrWhiteSpace(provided))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var expected = _internalOptions.ApiKey;
        if (string.IsNullOrWhiteSpace(expected))
        {
            return Task.FromResult(AuthenticateResult.Fail("Internal service authentication is not configured."));
        }

        var a = SHA256.HashData(Encoding.UTF8.GetBytes(provided.ToString()));
        var b = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        if (!CryptographicOperations.FixedTimeEquals(a, b))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid internal service key."));
        }

        var identity = new ClaimsIdentity(
            new[] { new Claim(FacilityAuthSchemes.InternalClaim, "true"), new Claim(ClaimTypes.Name, "internal-service") },
            FacilityAuthSchemes.Internal);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), FacilityAuthSchemes.Internal);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
