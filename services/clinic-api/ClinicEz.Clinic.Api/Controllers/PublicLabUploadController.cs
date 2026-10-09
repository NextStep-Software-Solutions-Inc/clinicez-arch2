using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Features.LabOrders;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace ClinicEz.Clinic.Api.Controllers;

/// <summary>
/// The anonymous upload page's API. The token in the path is an upload grant (hashed at rest, expiring, use-limited); it is
/// the only credential, and a wrong, expired or used-up token is always the same 404.
/// </summary>
[ApiController]
[Route("api/v1/public/lab-upload")]
[AllowAnonymous]
public sealed class PublicLabUploadController : ControllerBase
{
    private readonly ISender _sender;
    private readonly ClinicUploadOptions _options;

    public PublicLabUploadController(ISender sender, IOptions<ClinicUploadOptions> options)
    {
        _sender = sender;
        _options = options.Value;
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
    public async Task<ActionResult<ApiResponse<PublicLabUploadReceipt>>> SubmitExternalResult(
        [FromRoute] string token,
        [FromBody] AttachExternalLabResultRequest request,
        CancellationToken ct)
    {
        var (content, contentType) = LabResultUploadFiles.Decode(request.FileBase64, request.ContentType, request.DocumentType);

        var result = await _sender.Send(new SubmitPublicLabUploadCommand(
            token,
            request.ExternalLabName,
            content,
            contentType,
            request.FileName,
            request.Notes,
            request.ContactNumber,
            request.PathologistName,
            request.PathologistPrcLicense), ct);
        return Ok(ApiResponse<PublicLabUploadReceipt>.Success(result, "Diagnostic result uploaded and transmitted to attending physician."));
    }

    [HttpPost("{token}/multipart")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ApiResponse<PublicLabUploadReceipt>>> SubmitExternalResultMultipart(
        [FromRoute] string token,
        [FromForm] string? externalLabName,
        [FromForm] string? contactNumber,
        [FromForm] string? pathologistName,
        [FromForm] string? pathologistPrcLicense,
        [FromForm] string? notes,
        [FromForm] IFormFile? file,
        CancellationToken ct)
    {
        if (file == null || file.Length == 0)
        {
            throw new BadRequestException("A result file is required.");
        }

        if (file.Length > _options.UploadMaxBytes)
        {
            throw new BadRequestException($"The file is larger than the {_options.UploadMaxBytes / (1024 * 1024)} MB upload limit.");
        }

        using var ms = new System.IO.MemoryStream();
        await file.CopyToAsync(ms, ct);

        var result = await _sender.Send(new SubmitPublicLabUploadCommand(
            token,
            externalLabName,
            ms.ToArray(),
            file.ContentType,
            file.FileName,
            notes,
            contactNumber,
            pathologistName,
            pathologistPrcLicense), ct);
        return Ok(ApiResponse<PublicLabUploadReceipt>.Success(result, "Diagnostic result uploaded and transmitted to attending physician."));
    }
}
