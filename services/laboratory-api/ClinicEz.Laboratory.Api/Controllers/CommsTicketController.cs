using System;
using System.Collections.Generic;
using System.Security.Claims;
using ClinicEz.Laboratory.Api.Authorization;
using ClinicEz.Laboratory.Domain.Constants;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace ClinicEz.Laboratory.Api.Controllers;

[ApiController]
[Route("api/v1/comms")]
[Authorize(AuthenticationSchemes = FacilityAuthSchemes.Facility)]
public sealed class CommsTicketController : ControllerBase
{
    private readonly IOptions<InteropOptions> _interopOptions;
    private readonly ILabContext _labContext;
    private readonly IConfiguration _configuration;

    public CommsTicketController(
        IOptions<InteropOptions> interopOptions,
        ILabContext labContext,
        IConfiguration configuration)
    {
        _interopOptions = interopOptions;
        _labContext = labContext;
        _configuration = configuration;
    }

    [HttpPost("ticket")]
    [HasPermission(LabPermissions.RequisitionsRead)]
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

        var staffId = _labContext.StaffId?.ToString()
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? "system";

        var staffName = User.FindFirst(ClaimTypes.Name)?.Value
            ?? User.FindFirst("name")?.Value
            ?? "Laboratory Staff";

        var tenantId = !string.IsNullOrWhiteSpace(_labContext.TenantId)
            ? _labContext.TenantId
            : (User.FindFirst("tenant_id")?.Value ?? string.Empty);

        var laboratoryId = _labContext.LaboratoryId.HasValue && _labContext.LaboratoryId.Value != Guid.Empty
            ? _labContext.LaboratoryId.Value.ToString()
            : (User.FindFirst("laboratory_id")?.Value ?? User.FindFirst("facility_id")?.Value ?? string.Empty);

        var branchId = User.FindFirst("branch_id")?.Value;

        var permissions = MapPermissions(User);

        var (ticket, expiresAtUtc) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: signingKey,
            staffId: staffId,
            displayName: staffName,
            tenantId: tenantId,
            facilityId: laboratoryId,
            branchId: branchId,
            permissions: permissions,
            lifetime: TimeSpan.FromMinutes(5));

        return Ok(ApiResponse<CommsTicketResponseDto>.Success(
            new CommsTicketResponseDto(ticket, expiresAtUtc)));
    }

    private List<string> MapPermissions(ClaimsPrincipal user)
    {
        var permissions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            CommsPermissions.MessagingRead,
            CommsPermissions.MessagingWrite
        };

        var role = user.FindFirst("staff_role")?.Value ?? user.FindFirst(ClaimTypes.Role)?.Value ?? string.Empty;
        var isPathologist = string.Equals(role, "Pathologist", StringComparison.OrdinalIgnoreCase);
        var isMedTech = string.Equals(role, "MedicalTechnologist", StringComparison.OrdinalIgnoreCase);
        var isAdmin = string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase);

        if (_labContext.HasPermission(LabPermissions.SpecimensAccession)
            || _labContext.HasPermission(LabPermissions.ReportsVerify)
            || _labContext.HasPermission(LabPermissions.RequisitionsManage)
            || isPathologist
            || isMedTech
            || isAdmin)
        {
            permissions.Add(CommsPermissions.MessagingTriage);
            permissions.Add(CommsPermissions.TeleconsultCall);
        }

        // teleconsult:record is NEVER granted in laboratory
        return new List<string>(permissions);
    }
}
