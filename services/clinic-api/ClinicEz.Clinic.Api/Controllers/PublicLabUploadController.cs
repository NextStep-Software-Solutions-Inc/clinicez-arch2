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
            request.UploadedBy ?? "ExternalLab",
            request.ContactNumber,
            request.PathologistName,
            request.PathologistPrcLicense
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicLabOrderDto>.Success(result, "Diagnostic result uploaded and transmitted to attending physician."));
    }

    [HttpPost("{token}/multipart")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ApiResponse<ClinicLabOrderDto>>> SubmitExternalResultMultipart(
        [FromRoute] string token,
        [FromForm] string? externalLabName,
        [FromForm] string? contactNumber,
        [FromForm] string? pathologistName,
        [FromForm] string? pathologistPrcLicense,
        [FromForm] string? notes,
        [FromForm] Microsoft.AspNetCore.Http.IFormFile? file,
        CancellationToken ct)
    {
        string? fileBase64 = null;
        string docType = "PDF";
        if (file != null && file.Length > 0)
        {
            using var ms = new System.IO.MemoryStream();
            await file.CopyToAsync(ms, ct);
            var mime = string.IsNullOrEmpty(file.ContentType) ? "application/pdf" : file.ContentType;
            fileBase64 = $"data:{mime};base64,{Convert.ToBase64String(ms.ToArray())}";
            docType = mime.Contains("image", StringComparison.OrdinalIgnoreCase) ? "Photo" : "PDF";
        }

        var command = new SubmitPublicLabUploadCommand(
            token,
            externalLabName,
            docType,
            null,
            fileBase64,
            notes,
            "ExternalLab",
            contactNumber,
            pathologistName,
            pathologistPrcLicense
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicLabOrderDto>.Success(result, "Diagnostic result uploaded and transmitted to attending physician."));
    }
}
