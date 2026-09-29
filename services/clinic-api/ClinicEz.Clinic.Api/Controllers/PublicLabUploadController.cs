using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/public/lab-upload")]
[AllowAnonymous]
public sealed class PublicLabUploadController : ControllerBase
{
    private readonly ISender _sender;

    public PublicLabUploadController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("{token}/info")]
    public async Task<ActionResult<ApiResponse<PublicLabUploadInfoResponse>>> GetUploadInfo(
        [FromRoute] string token,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPublicLabUploadInfoQuery(token), ct);
        return Ok(ApiResponse<PublicLabUploadInfoResponse>.Success(result));
    }

    [HttpPost("{token}")]
    public async Task<ActionResult<ApiResponse<ClinicLabOrderDto>>> SubmitExternalResult(
        [FromRoute] string token,
        [FromBody] AttachExternalLabResultRequest request,
        CancellationToken ct)
    {
        var command = new SubmitPublicLabUploadCommand(
            token,
            request.ExternalLabName,
            request.DocumentType,
            request.DocumentUrl,
            request.FileBase64,
            request.Notes,
            request.UploadedBy ?? "ExternalLab"
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicLabOrderDto>.Success(result, "Diagnostic result uploaded and transmitted to attending physician."));
    }
}
