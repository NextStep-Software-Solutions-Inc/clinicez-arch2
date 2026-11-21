using System;
using System.Security.Claims;
using System.Security.Cryptography;
using ClinicEz.Pharmacy.Api.Controllers;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests.Comms;

/// <summary>
/// Empirical Adversarial Verification Suite for Challenger 2 (Milestone M3):
/// Pharmacy CommsTicketController role claim boundaries:
/// - Pharmacist, Admin, and Dispense/Review permissions receive messaging:triage and teleconsult:call.
/// - teleconsult:record is NEVER granted in Pharmacy under any circumstance.
/// - Cryptographic soundness and 503 on unconfigured signing key.
/// </summary>
public class PharmacyCommsTicketAdversarialTests
{
    private readonly string _privKey;
    private readonly string _pubKey;
    private readonly string _clientId = "pharmacy-client-01";
    private readonly string _tenantId = "tenant-stjude";
    private readonly Guid _pharmacyId = Guid.NewGuid();

    public PharmacyCommsTicketAdversarialTests()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        _privKey = ecdsa.ExportECPrivateKeyPem();
        _pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();
    }

    private CommsTicketController CreateController(
        IPharmacyContext pharmacyContext,
        string? signingKey = null,
        ClaimsPrincipal? user = null)
    {
        var options = Options.Create(new InteropOptions
        {
            ClientId = _clientId,
            SigningKey = signingKey ?? _privKey
        });

        var config = new ConfigurationBuilder().Build();
        var controller = new CommsTicketController(options, pharmacyContext, config);

        var httpContext = new DefaultHttpContext();
        if (user != null)
        {
            httpContext.User = user;
        }
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return controller;
    }

    [Fact]
    public void IssueTicket_PharmacistRole_GrantsCallAndTriage_StrictlyExcludesTeleconsultRecord()
    {
        var pharmacyContext = Substitute.For<IPharmacyContext>();
        pharmacyContext.TenantId.Returns(_tenantId);
        pharmacyContext.PharmacyId.Returns(_pharmacyId);

        var claims = new[]
        {
            new Claim("sub", "pharm-101"),
            new Claim("name", "Chief Pharmacist Alice"),
            new Claim("tenant_id", _tenantId),
            new Claim("pharmacy_id", _pharmacyId.ToString()),
            new Claim("staff_role", "Pharmacist")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(pharmacyContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _pharmacyId.ToString());
        validation.IsValid.Should().BeTrue();

        validation.Payload!.Permissions.Should().Contain([
            CommsPermissions.MessagingRead,
            CommsPermissions.MessagingWrite,
            CommsPermissions.MessagingTriage,
            CommsPermissions.TeleconsultCall
        ]);

        validation.Payload.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord,
            "Pharmacy comms tickets must NEVER contain teleconsult:record");
    }

    [Fact]
    public void IssueTicket_AdminRoleInPharmacy_StrictlyExcludesTeleconsultRecord()
    {
        var pharmacyContext = Substitute.For<IPharmacyContext>();
        pharmacyContext.TenantId.Returns(_tenantId);
        pharmacyContext.PharmacyId.Returns(_pharmacyId);

        var claims = new[]
        {
            new Claim("sub", "admin-pharm"),
            new Claim("name", "Pharmacy Admin"),
            new Claim("tenant_id", _tenantId),
            new Claim("pharmacy_id", _pharmacyId.ToString()),
            new Claim("staff_role", "Admin")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(pharmacyContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _pharmacyId.ToString());
        validation.IsValid.Should().BeTrue();
        validation.Payload!.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord,
            "Even Admin in Pharmacy must NEVER receive teleconsult:record");
    }

    [Fact]
    public void IssueTicket_UnconfiguredSigningKey_Returns503()
    {
        var pharmacyContext = Substitute.For<IPharmacyContext>();
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("staff_role", "Pharmacist")], "Facility"));

        var controller = CreateController(pharmacyContext, signingKey: string.Empty, user: user);

        var result = controller.IssueTicket();
        var statusResult = result.Result.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status503ServiceUnavailable);
    }
}
