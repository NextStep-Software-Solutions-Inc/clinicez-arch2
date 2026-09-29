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
}
