using System;
using System.Security.Claims;
using System.Security.Cryptography;
using ClinicEz.Organization.Api.Controllers;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Organization.Tests.Comms;

/// <summary>
/// Empirical Adversarial Verification Suite for Challenger 2 (Milestone M3):
/// Organization CommsTicketController role claim boundaries:
/// - Organization staff receive messaging:read, messaging:write, and teleconsult:call.
/// - teleconsult:record is NEVER granted in Organization under any circumstance.
/// - Cryptographic soundness and 503 on unconfigured signing key.
/// </summary>
public class OrganizationCommsTicketAdversarialTests
{
    private readonly string _privKey;
    private readonly string _pubKey;
    private readonly string _clientId = "organization-client-01";
    private readonly string _tenantId = "tenant-stjude";
    private readonly string _facilityId = "fac-org-01";

    public OrganizationCommsTicketAdversarialTests()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        _privKey = ecdsa.ExportECPrivateKeyPem();
        _pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();
    }

    private CommsTicketController CreateController(
        string? signingKey = null,
        ClaimsPrincipal? user = null)
    {
        var options = Options.Create(new InteropOptions
        {
            ClientId = _clientId,
            SigningKey = signingKey ?? _privKey
        });

        var config = new ConfigurationBuilder().Build();
        var controller = new CommsTicketController(options, config);

        var httpContext = new DefaultHttpContext();
        if (user != null)
        {
            httpContext.User = user;
        }
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return controller;
    }

    [Fact]
    public void IssueTicket_OrganizationStaff_GrantsCall_StrictlyExcludesTeleconsultRecord()
    {
        var claims = new[]
        {
            new Claim("sub", "org-user-01"),
            new Claim("name", "Org Admin Mark"),
            new Claim("tenant_id", _tenantId),
            new Claim("organization_id", _facilityId),
            new Claim("staff_role", "Admin")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _facilityId);
        validation.IsValid.Should().BeTrue();

        validation.Payload!.Permissions.Should().Contain([
            CommsPermissions.MessagingRead,
            CommsPermissions.MessagingWrite,
            CommsPermissions.TeleconsultCall
        ]);

        validation.Payload.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord,
            "Organization comms tickets must NEVER contain teleconsult:record");
    }

    [Fact]
    public void IssueTicket_UnconfiguredSigningKey_Returns503()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("staff_role", "Admin")], "Facility"));
        var controller = CreateController(signingKey: string.Empty, user: user);

        var result = controller.IssueTicket();
        var statusResult = result.Result.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status503ServiceUnavailable);
    }
}
