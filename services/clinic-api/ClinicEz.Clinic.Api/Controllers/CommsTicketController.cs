using System;
using System.Collections.Generic;
using System.Security.Claims;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/comms")]
[Authorize(AuthenticationSchemes = FacilityAuthSchemes.Facility)]
public sealed class CommsTicketController : ControllerBase
{
    private readonly IOptions<InteropOptions> _interopOptions;
    private readonly IClinicContext _clinicContext;
    private readonly IConfiguration _configuration;

    public CommsTicketController(
        IOptions<InteropOptions> interopOptions,
        IClinicContext clinicContext,
        IConfiguration configuration)
    {
        _interopOptions = interopOptions;
        _clinicContext = clinicContext;
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

        var staffId = _clinicContext.StaffId?.ToString()
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? "system";

        var staffName = _clinicContext.StaffName
            ?? User.FindFirst(ClaimTypes.Name)?.Value
            ?? User.FindFirst("name")?.Value
            ?? "Clinic Staff";

        var tenantId = !string.IsNullOrWhiteSpace(_clinicContext.TenantId)
            ? _clinicContext.TenantId
            : (User.FindFirst("tenant_id")?.Value ?? string.Empty);

        var clinicId = _clinicContext.ClinicId != Guid.Empty
            ? _clinicContext.ClinicId.ToString()
            : (User.FindFirst("clinic_id")?.Value ?? User.FindFirst("facility_id")?.Value ?? string.Empty);

        var branchId = _clinicContext.BranchId?.ToString() ?? User.FindFirst("branch_id")?.Value;

        var permissions = MapPermissions(User);

        var (ticket, expiresAtUtc) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: signingKey,
            staffId: staffId,
            displayName: staffName,
            tenantId: tenantId,
            facilityId: clinicId,
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
        var isDoctor = string.Equals(role, "Doctor", StringComparison.OrdinalIgnoreCase);
        var isAdmin = string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase)
            || _clinicContext.HasPermission(ClinicPermissions.SettingsManage);

        if (_clinicContext.HasPermission(ClinicPermissions.TriageRead)
            || _clinicContext.HasPermission(ClinicPermissions.TriageWrite)
            || _clinicContext.HasPermission(ClinicPermissions.QueueRead)
            || isDoctor
            || isAdmin
            || string.Equals(role, "Nurse", StringComparison.OrdinalIgnoreCase)
            || string.Equals(role, "Receptionist", StringComparison.OrdinalIgnoreCase))
        {
            permissions.Add(CommsPermissions.MessagingTriage);
        }

        if (_clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite)
            || _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign)
            || isDoctor
            || isAdmin)
        {
            permissions.Add(CommsPermissions.TeleconsultCall);
        }

        // teleconsult:record is strictly granted to attending clinicians / doctors / signers in clinic-api
        if (_clinicContext.HasPermission(ClinicPermissions.ConsultationsSign) || isDoctor || isAdmin)
        {
            permissions.Add(CommsPermissions.TeleconsultRecord);
        }

        return new List<string>(permissions);
    }
}
