using System;
using System.Collections.Generic;
using System.Reflection;
using System.Security.Claims;
using System.Security.Cryptography;
using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Api.Controllers;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Billing.Tests.Comms;

/// <summary>
/// Empirical Adversarial Verification Suite for Challenger 2 (Milestone M3):
/// Billing CommsTicketController role claim boundaries:
/// - Cashier, Supervisor, and InvoicesRead/Approvals permissions receive messaging:triage and teleconsult:call.
/// - teleconsult:record is NEVER granted in Billing under any circumstance.
/// - Mandatory [HasPermission(BillingPermissions.InvoicesRead)] attribute is declared on IssueTicket endpoint.
/// - Cryptographic soundness and 503 on unconfigured signing key.
/// </summary>
public class BillingCommsTicketAdversarialTests
{
    private readonly string _privKey;
    private readonly string _pubKey;
    private readonly string _clientId = "billing-client-01";
    private readonly string _tenantId = "tenant-stjude";
    private readonly string _facilityId = "fac-billing-01";

    public BillingCommsTicketAdversarialTests()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        _privKey = ecdsa.ExportECPrivateKeyPem();
        _pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();
    }

    private sealed class FakeBillingContext : IBillingContext
    {
        public string? TenantId { get; init; }
        public BillingCaller? Caller { get; init; }

        public BillingCaller RequireStaff() => Caller ?? throw new InvalidOperationException("No staff");
        public BillingCaller? TryGetStaff() => Caller;
        public bool HasPermission(string permission) => true;
    }

    private CommsTicketController CreateController(
        IBillingContext billingContext,
        string? signingKey = null,
        ClaimsPrincipal? user = null)
    {
        var options = Options.Create(new InteropOptions
        {
            ClientId = _clientId,
            SigningKey = signingKey ?? _privKey
        });

        var config = new ConfigurationBuilder().Build();
        var controller = new CommsTicketController(options, billingContext, config);

        var httpContext = new DefaultHttpContext();
        if (user != null)
        {
            httpContext.User = user;
        }
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return controller;
    }

    [Fact]
    public void Endpoint_HasPermissionAttribute_RequiresInvoicesRead()
    {
        var method = typeof(CommsTicketController).GetMethod(nameof(CommsTicketController.IssueTicket));
        method.Should().NotBeNull();

        var attr = method!.GetCustomAttribute<HasPermissionAttribute>();
        attr.Should().NotBeNull("IssueTicket in billing-api MUST be guarded by [HasPermission]");
        attr!.Permission.Should().Be(BillingPermissions.InvoicesRead);
    }

    [Fact]
    public void IssueTicket_CashierRole_GrantsCallAndTriage_StrictlyExcludesTeleconsultRecord()
    {
        var caller = new BillingCaller(
            TenantId: _tenantId,
            FacilityId: _facilityId,
            UserId: Guid.NewGuid(),
            UserName: "Cashier Jane",
            Role: StaffRole.Cashier,
            Permissions: [BillingPermissions.InvoicesRead, BillingPermissions.InvoicesCreate]);

        var billingContext = new FakeBillingContext
        {
            TenantId = _tenantId,
            Caller = caller
        };

        var claims = new[]
        {
            new Claim("sub", caller.UserId.ToString()),
            new Claim("name", caller.UserName),
            new Claim("tenant_id", _tenantId),
            new Claim("facility_id", _facilityId),
            new Claim("staff_role", "Cashier")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(billingContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _facilityId);
        validation.IsValid.Should().BeTrue();

        validation.Payload!.Permissions.Should().Contain([
            CommsPermissions.MessagingRead,
            CommsPermissions.MessagingWrite,
            CommsPermissions.MessagingTriage,
            CommsPermissions.TeleconsultCall
        ]);

        validation.Payload.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord,
            "Billing comms tickets must NEVER contain teleconsult:record");
    }

    [Fact]
    public void IssueTicket_SupervisorRole_StrictlyExcludesTeleconsultRecord()
    {
        var caller = new BillingCaller(
            TenantId: _tenantId,
            FacilityId: _facilityId,
            UserId: Guid.NewGuid(),
            UserName: "Supervisor Mark",
            Role: StaffRole.Supervisor,
            Permissions: [BillingPermissions.InvoicesRead, BillingPermissions.Approvals]);

        var billingContext = new FakeBillingContext
        {
            TenantId = _tenantId,
            Caller = caller
        };

        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("staff_role", "Supervisor")], "Facility"));
        var controller = CreateController(billingContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _facilityId);
        validation.IsValid.Should().BeTrue();
        validation.Payload!.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord,
            "Even Supervisor in Billing must NEVER receive teleconsult:record");
    }

    [Fact]
    public void IssueTicket_UnconfiguredSigningKey_Returns503()
    {
        var billingContext = new FakeBillingContext();
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("staff_role", "Cashier")], "Facility"));

        var controller = CreateController(billingContext, signingKey: string.Empty, user: user);

        var result = controller.IssueTicket();
        var statusResult = result.Result.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status503ServiceUnavailable);
    }
}
