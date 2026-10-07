using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Api.Authorization;
using ClinicEz.Laboratory.Domain.Constants;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Auth;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Laboratory.Api.Controllers;

/// <summary>Administrative sign-in management for staff members of the caller's laboratory.</summary>
[ApiController]
[Route("api/v1/laboratory/staff/{id:guid}")]
[Route("api/v1/staff/{id:guid}")]
public sealed class StaffCredentialsController : ControllerBase
{
    private readonly ILabAuthService _auth;
    private readonly ILabContext _context;

    public StaffCredentialsController(ILabAuthService auth, ILabContext context)
    {
        _auth = auth;
        _context = context;
    }

    /// <summary>Sets a temporary password (the staff member must change it at next sign-in) and revokes existing sessions.</summary>
    [HttpPost("credentials")]
    [HasPermission(LabPermissions.StaffManage)]
    public async Task<IActionResult> SetCredentials(Guid id, [FromBody] SetCredentialsRequest request, CancellationToken ct)
    {
        if (_context.LaboratoryId is not { } laboratoryId) return Forbid();

        var outcome = await _auth.SetTemporaryPasswordAsync(id, laboratoryId, request.TemporaryPassword, ct);
        if (outcome.Ok) return Ok(ApiResponse<object>.Success(new { }, "Temporary password set. The staff member must change it at next sign-in."));

        var status = outcome.Failure == AuthFailure.NotFound ? StatusCodes.Status404NotFound : StatusCodes.Status400BadRequest;
        return StatusCode(status, ApiResponse<object>.Fail(outcome.Message ?? "Request failed."));
    }

    [HttpPost("revoke-sessions")]
    [HasPermission(LabPermissions.StaffManage)]
    public async Task<IActionResult> RevokeSessions(Guid id, CancellationToken ct)
    {
        if (_context.LaboratoryId is not { } laboratoryId) return Forbid();

        var ok = await _auth.RevokeSessionsAsync(id, laboratoryId, ct);
        return ok
            ? Ok(ApiResponse<object>.Success(new { }, "All sessions revoked."))
            : NotFound(ApiResponse<object>.Fail("Staff member not found."));
    }
}
