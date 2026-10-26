using System;
using System.Collections.Generic;
using System.Security.Claims;
using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace ClinicEz.Billing.Api.Controllers;

[ApiController]
[Route("api/v1/comms")]
[Authorize(AuthenticationSchemes = FacilityAuthSchemes.Facility)]
public sealed class CommsTicketController : ControllerBase
{
    private readonly IOptions<InteropOptions> _interopOptions;
    private readonly IBillingContext _billingContext;
    private readonly IConfiguration _configuration;

    public CommsTicketController(
        IOptions<InteropOptions> interopOptions,
        IBillingContext billingContext,
        IConfiguration configuration)
    {
        _interopOptions = interopOptions;
        _billingContext = billingContext;
        _configuration = configuration;
    }

    [HttpPost("ticket")]
    [HasPermission(BillingPermissions.InvoicesRead)]
    public ActionResult<ApiResponse<CommsTicketResponseDto>> IssueTicket()
    {
        var clientId = _interopOptions.Value.ClientId;
        if (string.IsNullOrWhiteSpace(clientId))
        {
            clientId = _configuration["HUB_CLIENT_ID"] ?? _configuration["Messaging:ClientId"];
        }

        var signingKey = _interopOptions.Value.SigningKey;
        if (string.IsNullOrWhiteSpace(signingKey))
        {
            signingKey = _configuration["HUB_SIGNING_KEY"] ?? _configuration["Messaging:SigningKey"];
        }

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(signingKey))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                ApiResponse<CommsTicketResponseDto>.Fail(
                    "Comms ticket issuance unavailable: facility messaging signing key is not configured.",
                    "SERVICE_UNAVAILABLE"));
        }

        var caller = _billingContext.TryGetStaff();
        var staffId = caller?.UserId.ToString()
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? "system";

        var staffName = caller?.UserName
            ?? User.FindFirst(ClaimTypes.Name)?.Value
            ?? User.FindFirst("name")?.Value
            ?? "Billing Staff";

        var tenantId = caller?.TenantId
            ?? _billingContext.TenantId
            ?? User.FindFirst("tenant_id")?.Value
            ?? string.Empty;

        var facilityId = caller?.FacilityId
            ?? User.FindFirst("facility_id")?.Value
            ?? User.FindFirst("billing_id")?.Value
            ?? string.Empty;

        var branchId = User.FindFirst("branch_id")?.Value;

        var permissions = MapPermissions(User, caller);

        var (ticket, expiresAtUtc) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: signingKey,
            staffId: staffId,
            displayName: staffName,
            tenantId: tenantId,
            facilityId: facilityId,
            branchId: branchId,
            permissions: permissions,
            lifetime: TimeSpan.FromMinutes(5));

        return Ok(ApiResponse<CommsTicketResponseDto>.Success(
            new CommsTicketResponseDto(ticket, expiresAtUtc)));
    }

    private List<string> MapPermissions(ClaimsPrincipal user, BillingCaller? caller)
    {
        var permissions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            CommsPermissions.MessagingRead,
            CommsPermissions.MessagingWrite
        };

        var isCashier = caller?.Role == StaffRole.Cashier;
        var isSupervisor = caller?.Role == StaffRole.Supervisor;

        if (_billingContext.HasPermission(BillingPermissions.InvoicesRead)
            || _billingContext.HasPermission(BillingPermissions.InvoicesCreate)
            || _billingContext.HasPermission(BillingPermissions.Approvals)
            || isCashier
            || isSupervisor)
        {
            permissions.Add(CommsPermissions.MessagingTriage);
            permissions.Add(CommsPermissions.TeleconsultCall);
        }

        // teleconsult:record is NEVER granted in billing
        return new List<string>(permissions);
    }
}
