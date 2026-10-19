using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/clinic-settings")]
public sealed class ClinicSettingsController : ControllerBase
{
    private readonly ISender _sender;

    public ClinicSettingsController(ISender sender)
    {
        _sender = sender;
    }

    /// <summary>Evaluates pre-flight publishing readiness checklist.</summary>
    [HttpGet("readiness")]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<ActionResult<ApiResponse<ClinicPublishingReadinessDto>>> GetPublishingReadiness(CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicPublishingReadinessQuery(), ct);
        return Ok(ApiResponse<ClinicPublishingReadinessDto>.Success(result));
    }

    /// <summary>Publishes or unpublishes the clinic from the patient discovery directory.</summary>
    [HttpPut("directory-publishing")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicPublishingResultDto>>> PublishToDirectory(
        [FromBody] PublishClinicRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new PublishClinicToDirectoryCommand(request.IsPublished), ct);
        return Ok(ApiResponse<ClinicPublishingResultDto>.Success(result, result.Message));
    }

    /// <summary>Toggles dynamic online booking pause for capacity management.</summary>
    [HttpPut("booking-pause")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicBookingPauseResultDto>>> ToggleBookingPause(
        [FromBody] ToggleBookingPauseRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ToggleOnlineBookingPauseCommand(request.IsPaused), ct);
        return Ok(ApiResponse<ClinicBookingPauseResultDto>.Success(result, result.Message));
    }
}

public sealed record PublishClinicRequest(bool IsPublished);
public sealed record ToggleBookingPauseRequest(bool IsPaused);
