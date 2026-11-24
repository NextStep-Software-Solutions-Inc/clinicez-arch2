using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

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

    /// <summary>Uploads and stores DOH LTO proof document (PDF/JPEG/PNG up to 5 MB).</summary>
    [HttpPost("lto-proof")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ApiResponse<EvidenceProofUploadResultDto>>> UploadLtoProof(
        [FromForm] IFormFile? file,
        [FromQuery] bool skipPendingVerificationSync = false,
        [FromQuery] bool stageOnly = false,
        CancellationToken ct = default)
    {
        var (fileName, contentType, length, bytes) = await VerificationEvidenceHelper.ReadValidatedFormFileAsync(file, ct);
        var result = await _sender.Send(new UploadLtoProofCommand(fileName, contentType, length, bytes, skipPendingVerificationSync, stageOnly), ct);
        return Ok(ApiResponse<EvidenceProofUploadResultDto>.Success(result, "DOH LTO proof uploaded."));
    }

    /// <summary>Streams the clinic's uploaded DOH LTO proof document for inline viewing.</summary>
    [HttpGet("lto-proof")]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<IActionResult> GetLtoProof(CancellationToken ct)
    {
        var file = await _sender.Send(new GetLtoProofEvidenceQuery(), ct);
        if (file == null)
        {
            return NotFound(ApiResponse<object>.Fail("No DOH LTO proof document is uploaded for this clinic."));
        }

        Response.Headers.CacheControl = "private, no-store";
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.ContentDisposition = $"inline; filename=\"{file.FileName}\"";
        return File(file.Bytes, file.ContentType);
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

    /// <summary>Updates an active pending facility directory verification submission in place.</summary>
    [HttpPut("directory-publishing/pending")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicPublishingResultDto>>> UpdatePendingVerification(CancellationToken ct)
    {
        var result = await _sender.Send(new UpdatePendingFacilityVerificationCommand(), ct);
        return Ok(ApiResponse<ClinicPublishingResultDto>.Success(result, result.Message));
    }

    /// <summary>Withdraws a pending or active directory verification submission.</summary>
    [HttpPost("directory-publishing/withdraw")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicPublishingResultDto>>> WithdrawVerification(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] WithdrawFacilityVerificationRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new WithdrawFacilityVerificationCommand(request?.Reason), ct);
        return Ok(ApiResponse<ClinicPublishingResultDto>.Success(result, result.Message));
    }

    /// <summary>Toggles dynamic online booking pause for capacity management.</summary>
    [HttpPut("booking-pause")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicBookingPauseResultDto>>> ToggleBookingPause(
        [FromBody] ToggleBookingPauseRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ToggleOnlineBookingPauseCommand(request.IsPaused, request.SkipPendingVerificationSync), ct);
        return Ok(ApiResponse<ClinicBookingPauseResultDto>.Success(result, result.Message));
    }
}

public sealed record PublishClinicRequest(bool IsPublished);
public sealed record ToggleBookingPauseRequest(bool IsPaused, bool SkipPendingVerificationSync = false);
public sealed record WithdrawFacilityVerificationRequest(string? Reason = null);
