using System;
using System.Collections.Generic;
using System.Security.Claims;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace ClinicEz.Organization.Api.Controllers;

[ApiController]
[Route("api/v1/comms")]
[Authorize(AuthenticationSchemes = FacilityAuthSchemes.Facility)]
public sealed class CommsTicketController : ControllerBase
{
    private readonly IOptions<InteropOptions> _interopOptions;
    private readonly IConfiguration _configuration;

    public CommsTicketController(
        IOptions<InteropOptions> interopOptions,
        IConfiguration configuration)
    {
        _interopOptions = interopOptions;
        _configuration = configuration;
    }

    [HttpPost("ticket")]
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

        var staffId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? "system";

        var staffName = User.FindFirst(ClaimTypes.Name)?.Value
            ?? User.FindFirst("name")?.Value
            ?? "Organization Staff";

        var tenantId = User.FindFirst("tenant_id")?.Value ?? string.Empty;
        var facilityId = User.FindFirst("facility_id")?.Value ?? User.FindFirst("organization_id")?.Value ?? string.Empty;
        var branchId = User.FindFirst("branch_id")?.Value;

        var permissions = MapPermissions(User);

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

    private static List<string> MapPermissions(ClaimsPrincipal user)
    {
        var permissions = new List<string>
        {
            CommsPermissions.MessagingRead,
            CommsPermissions.MessagingWrite,
            CommsPermissions.TeleconsultCall
        };

        // teleconsult:record is NEVER granted in organization
        return permissions;
    }
}
