using System;
using System.Reflection;
using System.Security.Claims;
using System.Security.Cryptography;
using ClinicEz.Laboratory.Api.Authorization;
using ClinicEz.Laboratory.Api.Controllers;
using ClinicEz.Laboratory.Domain.Constants;
using ClinicEz.Laboratory.Domain.Interfaces;
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

namespace ClinicEz.Laboratory.Application.Tests.Comms;

/// <summary>
/// Empirical Adversarial Verification Suite for Challenger 2 (Milestone M3):
/// Laboratory CommsTicketController role claim boundaries:
/// - Pathologist, MedicalTechnologist, and Admin receive messaging:triage and teleconsult:call.
/// - teleconsult:record is NEVER granted in Laboratory under any circumstance.
/// - Mandatory [HasPermission(LabPermissions.RequisitionsRead)] attribute is declared on IssueTicket endpoint.
/// - Cryptographic soundness and 503 on unconfigured signing key.
/// </summary>
public class LaboratoryCommsTicketAdversarialTests
{
    private readonly string _privKey;
    private readonly string _pubKey;
    private readonly string _clientId = "laboratory-client-01";
    private readonly string _tenantId = "tenant-stjude";
    private readonly Guid _labId = Guid.NewGuid();

    public LaboratoryCommsTicketAdversarialTests()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        _privKey = ecdsa.ExportECPrivateKeyPem();
        _pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();
    }

    private CommsTicketController CreateController(
        ILabContext labContext,
        string? signingKey = null,
        ClaimsPrincipal? user = null)
    {
        var options = Options.Create(new InteropOptions
        {
            ClientId = _clientId,
            SigningKey = signingKey ?? _privKey
        });

        var config = new ConfigurationBuilder().Build();
        var controller = new CommsTicketController(options, labContext, config);

        var httpContext = new DefaultHttpContext();
        if (user != null)
        {
            httpContext.User = user;
        }
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return controller;
    }

    [Fact]
    public void Endpoint_HasPermissionAttribute_RequiresRequisitionsRead()
    {
        var method = typeof(CommsTicketController).GetMethod(nameof(CommsTicketController.IssueTicket));
        method.Should().NotBeNull();

        var attr = method!.GetCustomAttribute<HasPermissionAttribute>();
        attr.Should().NotBeNull("IssueTicket in laboratory-api MUST be guarded by [HasPermission]");
        attr!.Permission.Should().Be(LabPermissions.RequisitionsRead);
    }

    [Fact]
    public void IssueTicket_PathologistRole_GrantsCallAndTriage_StrictlyExcludesTeleconsultRecord()
    {
        var labContext = Substitute.For<ILabContext>();
        labContext.TenantId.Returns(_tenantId);
        labContext.LaboratoryId.Returns(_labId);

        var claims = new[]
        {
            new Claim("sub", "path-101"),
            new Claim("name", "Dr. Pathologist House"),
            new Claim("tenant_id", _tenantId),
            new Claim("laboratory_id", _labId.ToString()),
            new Claim("staff_role", "Pathologist")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(labContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _labId.ToString());
        validation.IsValid.Should().BeTrue();

        validation.Payload!.Permissions.Should().Contain([
            CommsPermissions.MessagingRead,
            CommsPermissions.MessagingWrite,
            CommsPermissions.MessagingTriage,
            CommsPermissions.TeleconsultCall
        ]);

        validation.Payload.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord,
            "Laboratory comms tickets must NEVER contain teleconsult:record");
    }

    [Fact]
    public void IssueTicket_MedicalTechnologistRole_GrantsCallAndTriage_StrictlyExcludesTeleconsultRecord()
    {
        var labContext = Substitute.For<ILabContext>();
        labContext.TenantId.Returns(_tenantId);
        labContext.LaboratoryId.Returns(_labId);

        var claims = new[]
        {
            new Claim("sub", "medtech-01"),
            new Claim("name", "MedTech Bob"),
            new Claim("tenant_id", _tenantId),
            new Claim("laboratory_id", _labId.ToString()),
            new Claim("staff_role", "MedicalTechnologist")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(labContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _labId.ToString());
        validation.IsValid.Should().BeTrue();

        validation.Payload!.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord,
            "MedTech comms tickets must NEVER contain teleconsult:record");
    }

    [Fact]
    public void IssueTicket_UnconfiguredSigningKey_Returns503()
    {
        var labContext = Substitute.For<ILabContext>();
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("staff_role", "Pathologist")], "Facility"));

        var controller = CreateController(labContext, signingKey: string.Empty, user: user);

        var result = controller.IssueTicket();
        var statusResult = result.Result.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status503ServiceUnavailable);
    }
}
