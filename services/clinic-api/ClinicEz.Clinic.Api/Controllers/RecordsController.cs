using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Records.Commands;
using ClinicEz.Clinic.Application.Features.Records.DTOs;
using ClinicEz.Clinic.Application.Features.Records.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/records")]
public sealed class RecordsController : ControllerBase
{
    private readonly ISender _sender;

    public RecordsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpPost("attachments")]
    [HasPermission(ClinicPermissions.RecordsUpload)]
    public async Task<ActionResult<ApiResponse<ClinicRecordAttachmentDto>>> UploadAttachment(
        [FromBody] UploadRecordAttachmentCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicRecordAttachmentDto>.Success(result, "Record attachment uploaded successfully."));
    }

    [HttpGet("patients/{patientId:guid}")]
    [HasPermission(ClinicPermissions.RecordsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ClinicRecordAttachmentDto>>>> GetPatientAttachments(
        Guid patientId,
        [FromQuery] string? recordType,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientRecordAttachmentsQuery(patientId, recordType), ct);
        return Ok(ApiResponse<IReadOnlyList<ClinicRecordAttachmentDto>>.Success(result));
    }

    [HttpPost("attachments/{id:guid}/verify")]
    [HasPermission(ClinicPermissions.RecordsUpload)]
    public async Task<ActionResult<ApiResponse<ClinicRecordAttachmentDto>>> VerifyAttachment(
        Guid id,
        [FromBody] VerifyAttachmentRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new VerifyRecordAttachmentCommand(id, request.IsApproved, request.RejectionReason), ct);
        return Ok(ApiResponse<ClinicRecordAttachmentDto>.Success(result, "Attachment verification updated."));
    }

    [HttpPost("attachments/upload")]
    [HasPermission(ClinicPermissions.RecordsUpload)]
    public async Task<ActionResult<ApiResponse<ClinicRecordAttachmentDto>>> UploadAttachmentFile(
        [FromForm] UploadRecordAttachmentForm form,
        CancellationToken ct)
    {
        if (form.File == null || form.File.Length == 0)
        {
            return BadRequest(ApiResponse<ClinicRecordAttachmentDto>.Fail("File payload is required."));
        }

        using var memoryStream = new MemoryStream();
        await form.File.CopyToAsync(memoryStream, ct);

        var command = new UploadAndEncryptRecordAttachmentCommand(
            PatientId: form.PatientId,
            ConsultationId: form.ConsultationId,
            RecordType: string.IsNullOrWhiteSpace(form.RecordType) ? "LabResult" : form.RecordType,
            Title: string.IsNullOrWhiteSpace(form.Title) ? form.File.FileName : form.Title,
            FileName: form.File.FileName,
            ContentType: string.IsNullOrWhiteSpace(form.File.ContentType) ? "application/octet-stream" : form.File.ContentType,
            FileBytes: memoryStream.ToArray(),
            Notes: form.Notes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicRecordAttachmentDto>.Success(result, "Attachment uploaded and encrypted successfully."));
    }

    [HttpGet("attachments/{id:guid}/download")]
    [HasPermission(ClinicPermissions.RecordsRead)]
    public async Task<IActionResult> DownloadAttachment(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new DownloadRecordAttachmentQuery(id), ct);
        if (result == null)
        {
            return NotFound(ApiResponse<object>.Fail("Attachment file not found or unauthorized."));
        }

        return File(result.FileBytes, result.ContentType, result.FileName);
    }

    [HttpPost("intake/patient-shared-file")]
    public async Task<ActionResult<ApiResponse<ClinicRecordAttachmentDto>>> IntakePatientSharedFile(
        [FromForm] IntakePatientSharedFileForm form,
        CancellationToken ct)
    {
        if (form.File == null || form.File.Length == 0)
        {
            return BadRequest(ApiResponse<ClinicRecordAttachmentDto>.Fail("File payload is required."));
        }

        using var memoryStream = new MemoryStream();
        await form.File.CopyToAsync(memoryStream, ct);

        var command = new IntakePatientSharedFileCommand(
            PatientId: form.PatientId,
            AppointmentId: form.AppointmentId,
            ConsultationId: form.ConsultationId,
            FileId: form.FileId,
            RecordType: string.IsNullOrWhiteSpace(form.RecordType) ? "LabResult" : form.RecordType,
            Title: string.IsNullOrWhiteSpace(form.Title) ? form.File.FileName : form.Title,
            FileName: form.File.FileName,
            ContentType: string.IsNullOrWhiteSpace(form.File.ContentType) ? "application/octet-stream" : form.File.ContentType,
            FileBytes: memoryStream.ToArray(),
            Notes: form.Notes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicRecordAttachmentDto>.Success(result, "Patient shared file ingested and encrypted successfully."));
    }
}

public sealed record VerifyAttachmentRequest(bool IsApproved, string? RejectionReason = null);

public sealed class UploadRecordAttachmentForm
{
    public Guid PatientId { get; set; }
    public Guid? ConsultationId { get; set; }
    public string? RecordType { get; set; }
    public string? Title { get; set; }
    public string? Notes { get; set; }
    public Microsoft.AspNetCore.Http.IFormFile File { get; set; } = null!;
}

public sealed class IntakePatientSharedFileForm
{
    public Guid PatientId { get; set; }
    public Guid? AppointmentId { get; set; }
    public Guid? ConsultationId { get; set; }
    public Guid? FileId { get; set; }
    public string? RecordType { get; set; }
    public string? Title { get; set; }
    public string? Notes { get; set; }
    public Microsoft.AspNetCore.Http.IFormFile File { get; set; } = null!;
}

