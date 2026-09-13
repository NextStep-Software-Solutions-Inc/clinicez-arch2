using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace PatientAppBE.Api.Tests.Infrastructure;

/// <summary>
/// Fake authentication handler for integration tests.
/// Always returns an authenticated principal so tests can call
/// <see cref="Microsoft.AspNetCore.Authorization.AuthorizeAttribute"/>-protected endpoints
/// without providing a real Clerk JWT.
/// </summary>
public sealed class TestJwtAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "TestScheme";
    public const string TestClerkUserId = "user_test_integration";

    public TestJwtAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim("sub", TestClerkUserId),
            new Claim(ClaimTypes.NameIdentifier, TestClerkUserId),
            new Claim(ClaimTypes.Name, "Integration Test User"),
        };

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        var ticket = new AuthenticationTicket(principal, SchemeName);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
