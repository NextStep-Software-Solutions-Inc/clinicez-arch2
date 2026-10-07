using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

/// <summary>Administrative sign-in management for staff members of the caller's clinic.</summary>
[ApiController]
[Route("api/v1/staff/{id:guid}")]
public sealed class StaffCredentialsController : ControllerBase
{
    private readonly IClinicAuthService _auth;

    public StaffCredentialsController(IClinicAuthService auth) => _auth = auth;

    /// <summary>Sets a temporary password (the staff member must change it at next sign-in) and revokes existing sessions.</summary>
    [HttpPost("credentials")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<IActionResult> SetCredentials(Guid id, [FromBody] SetCredentialsRequest request, CancellationToken ct)
    {
        var outcome = await _auth.SetTemporaryPasswordAsync(id, request.TemporaryPassword, ct);
        if (outcome.Ok) return Ok(ApiResponse<object>.Success(new { }, "Temporary password set. The staff member must change it at next sign-in."));

        var status = outcome.Failure == AuthFailure.NotFound ? StatusCodes.Status404NotFound : StatusCodes.Status400BadRequest;
        return StatusCode(status, ApiResponse<object>.Fail(outcome.Message ?? "Request failed."));
    }

    [HttpPost("revoke-sessions")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<IActionResult> RevokeSessions(Guid id, CancellationToken ct)
    {
        var ok = await _auth.RevokeSessionsAsync(id, ct);
        return ok
            ? Ok(ApiResponse<object>.Success(new { }, "All sessions revoked."))
            : NotFound(ApiResponse<object>.Fail("Staff member not found."));
    }
}
