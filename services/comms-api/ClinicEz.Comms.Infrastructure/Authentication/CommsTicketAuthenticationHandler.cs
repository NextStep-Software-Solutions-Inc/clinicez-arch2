using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Comms.Infrastructure.Authentication;

public static class CommsTicketAuthenticationDefaults
{
    public const string AuthenticationScheme = "CommsTicket";
}

public class CommsTicketAuthenticationOptions : AuthenticationSchemeOptions
{
    public string? ExpectedTenantId { get; set; }
    public string? ExpectedFacilityId { get; set; }
    public string? StaticPublicKeyPem { get; set; }
}

public class CommsTicketAuthenticationHandler : AuthenticationHandler<CommsTicketAuthenticationOptions>
{
    public CommsTicketAuthenticationHandler(
        IOptionsMonitor<CommsTicketAuthenticationOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string? ticket = null;

        // 1. Check Authorization header
        if (Request.Headers.TryGetValue("Authorization", out var authHeaderValues))
        {
            var headerValue = authHeaderValues.ToString();
            if (headerValue.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                ticket = headerValue["Bearer ".Length..].Trim();
            }
        }

        // 2. Dual extraction: query param ?access_token= (especially for SignalR WebSockets)
        if (string.IsNullOrWhiteSpace(ticket) && Request.Query.TryGetValue("access_token", out var queryValues))
        {
            ticket = queryValues.ToString().Trim();
        }

        if (string.IsNullOrWhiteSpace(ticket))
        {
            return AuthenticateResult.NoResult();
        }

        // 3. Validate ticket
        CommsTicketValidationResult validationResult;

        var keyClient = Context.RequestServices.GetService<IHubKeyClient>();
        if (keyClient != null)
        {
            validationResult = await CommsTicketValidator.ValidateAsync(
                ticket,
                keyClient,
                Options.ExpectedTenantId,
                Options.ExpectedFacilityId,
                ct: Context.RequestAborted);
        }
        else if (!string.IsNullOrWhiteSpace(Options.StaticPublicKeyPem))
        {
            validationResult = CommsTicketValidator.Validate(
                ticket,
                Options.StaticPublicKeyPem,
                Options.ExpectedTenantId,
                Options.ExpectedFacilityId);
        }
        else
        {
            // Fallback decode for development/test environments without registered Hub key service
            var parts = ticket.Split('.');
            if (parts.Length != 2)
            {
                return AuthenticateResult.Fail("Malformed ticket structure: expected {payload}.{signature}.");
            }

            try
            {
                var payloadBytes = Base64UrlHelper.Decode(parts[0]);
                var payload = System.Text.Json.JsonSerializer.Deserialize<CommsTicketPayload>(payloadBytes, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (payload == null)
                {
                    return AuthenticateResult.Fail("Null ticket payload.");
                }

                var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                if (payload.Exp < now - 30)
                {
                    return AuthenticateResult.Fail("Ticket expired.");
                }

                validationResult = CommsTicketValidationResult.Success(payload);
            }
            catch (Exception ex)
            {
                return AuthenticateResult.Fail($"Failed to decode ticket: {ex.Message}");
            }
        }

        if (!validationResult.IsValid || validationResult.Payload == null)
        {
            return AuthenticateResult.Fail(validationResult.ErrorMessage ?? "Invalid comms ticket.");
        }

        var p = validationResult.Payload;
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, p.Sub),
            new("sub", p.Sub),
            new(ClaimTypes.Name, p.Name),
            new("name", p.Name),
            new("tenant_id", p.TenantId),
            new("facility_id", p.FacilityId),
            new("iss", p.Iss)
        };

        if (!string.IsNullOrWhiteSpace(p.BranchId))
        {
            claims.Add(new Claim("branch_id", p.BranchId));
        }

        foreach (var perm in p.Permissions)
        {
            claims.Add(new Claim("permission", perm));
            claims.Add(new Claim("permissions", perm));
        }

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var authTicket = new AuthenticationTicket(principal, Scheme.Name);

        return AuthenticateResult.Success(authTicket);
    }
}
