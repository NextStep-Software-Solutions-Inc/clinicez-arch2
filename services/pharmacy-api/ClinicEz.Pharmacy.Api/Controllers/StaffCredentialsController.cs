using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Api.Authorization;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Auth;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Pharmacy.Api.Controllers;

/// <summary>Administrative sign-in management for staff members of the caller's pharmacy.</summary>
[ApiController]
[Route("api/v1/staff/{id:guid}")]
public sealed class StaffCredentialsController : ControllerBase
{
    private readonly IPharmacyAuthService _auth;
    private readonly IPharmacyContext _context;

    public StaffCredentialsController(IPharmacyAuthService auth, IPharmacyContext context)
    {
        _auth = auth;
        _context = context;
    }

    /// <summary>Sets a temporary password (the staff member must change it at next sign-in) and revokes existing sessions.</summary>
    [HttpPost("credentials")]
    [HasPermission(PharmacyPermissions.StaffManage)]
    public async Task<IActionResult> SetCredentials(Guid id, [FromBody] SetCredentialsRequest request, CancellationToken ct)
    {
        var outcome = await _auth.SetTemporaryPasswordAsync(id, _context.PharmacyId, request.TemporaryPassword, ct);
        if (outcome.Ok) return Ok(ApiResponse<object>.Success(new { }, "Temporary password set. The staff member must change it at next sign-in."));

        var status = outcome.Failure == AuthFailure.NotFound ? StatusCodes.Status404NotFound : StatusCodes.Status400BadRequest;
        return StatusCode(status, ApiResponse<object>.Fail(outcome.Message ?? "Request failed."));
    }

    [HttpPost("revoke-sessions")]
    [HasPermission(PharmacyPermissions.StaffManage)]
    public async Task<IActionResult> RevokeSessions(Guid id, CancellationToken ct)
    {
        var ok = await _auth.RevokeSessionsAsync(id, _context.PharmacyId, ct);
        return ok
            ? Ok(ApiResponse<object>.Success(new { }, "All sessions revoked."))
            : NotFound(ApiResponse<object>.Fail("Staff member not found."));
    }
}