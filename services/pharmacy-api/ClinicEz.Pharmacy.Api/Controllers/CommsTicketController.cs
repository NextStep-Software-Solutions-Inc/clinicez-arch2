using System;
using System.Collections.Generic;
using System.Security.Claims;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace ClinicEz.Pharmacy.Api.Controllers;

[ApiController]
[Route("api/v1/comms")]
[Authorize(AuthenticationSchemes = FacilityAuthSchemes.Facility)]
public sealed class CommsTicketController : ControllerBase
{
    private readonly IOptions<InteropOptions> _interopOptions;
    private readonly IPharmacyContext _pharmacyContext;
    private readonly IConfiguration _configuration;

    public CommsTicketController(
        IOptions<InteropOptions> interopOptions,
        IPharmacyContext pharmacyContext,
        IConfiguration configuration)
    {
        _interopOptions = interopOptions;
        _pharmacyContext = pharmacyContext;
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

        var staffId = _pharmacyContext.StaffId?.ToString()
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? "system";

        var staffName = User.FindFirst(ClaimTypes.Name)?.Value
            ?? User.FindFirst("name")?.Value
            ?? "Pharmacy Staff";

        var tenantId = !string.IsNullOrWhiteSpace(_pharmacyContext.TenantId)
            ? _pharmacyContext.TenantId
            : (User.FindFirst("tenant_id")?.Value ?? string.Empty);

        var pharmacyId = _pharmacyContext.PharmacyId != Guid.Empty
            ? _pharmacyContext.PharmacyId.ToString()
            : (User.FindFirst("pharmacy_id")?.Value ?? User.FindFirst("facility_id")?.Value ?? string.Empty);

        var branchId = User.FindFirst("branch_id")?.Value;

        var permissions = MapPermissions(User);

        var (ticket, expiresAtUtc) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: signingKey,
            staffId: staffId,
            displayName: staffName,
            tenantId: tenantId,
            facilityId: pharmacyId,
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
        var isPharmacist = string.Equals(role, "Pharmacist", StringComparison.OrdinalIgnoreCase);
        var isAdmin = string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase);

        if (_pharmacyContext.HasPermission(PharmacyPermissions.PrescriptionsDispense)
            || _pharmacyContext.HasPermission(PharmacyPermissions.PrescriptionsReview)
            || isPharmacist
            || isAdmin)
        {
            permissions.Add(CommsPermissions.MessagingTriage);
            permissions.Add(CommsPermissions.TeleconsultCall);
        }

        // teleconsult:record is NEVER granted in pharmacy
        return new List<string>(permissions);
    }
}
