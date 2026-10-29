using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Kiosk.Commands;
using ClinicEz.Clinic.Application.Features.Kiosk.DTOs;
using ClinicEz.Clinic.Application.Features.Kiosk.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/kiosk/token")]
public sealed class KioskController : ControllerBase
{
    private readonly ISender _sender;

    public KioskController(ISender sender)
    {
        _sender = sender;
    }

    [HttpPost("mint")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<MintKioskTokenResultDto>>> Mint(
        [FromBody] MintKioskTokenRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new MintKioskTokenCommand(request.DeviceLabel, request.ExpiryDays), ct);
        return Ok(ApiResponse<MintKioskTokenResultDto>.Success(result, "Kiosk token minted successfully."));
    }

    [HttpPost("revoke")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<RevokeKioskTokenResultDto>>> Revoke(
        [FromBody] RevokeKioskTokenRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new RevokeKioskTokenCommand(request?.Reason), ct);
        return Ok(ApiResponse<RevokeKioskTokenResultDto>.Success(result, result.Message));
    }

    [HttpGet("status")]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<ActionResult<ApiResponse<KioskTokenStatusDto>>> GetStatus(CancellationToken ct)
    {
        var result = await _sender.Send(new GetKioskTokenStatusQuery(), ct);
        return Ok(ApiResponse<KioskTokenStatusDto>.Success(result));
    }
}
