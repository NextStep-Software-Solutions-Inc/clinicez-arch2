using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Documents.Commands;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Application.Features.Documents.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/documents")]
public sealed class DocumentsController : ControllerBase
{
    private readonly ISender _sender;

    public DocumentsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpPost("medical-certificates")]
    [HasPermission(ClinicPermissions.DocumentsIssue)]
    public async Task<ActionResult<ApiResponse<MedicalCertificateDto>>> IssueMedicalCertificate(
        [FromBody] IssueMedicalCertificateCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<MedicalCertificateDto>.Success(result, "Medical certificate issued and locked successfully."));
    }

    [HttpGet("medical-certificates")]
    [HasPermission(ClinicPermissions.DocumentsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<MedicalCertificateDto>>>> GetMedicalCertificates(
        [FromQuery] Guid? patientId,
        [FromQuery] Guid? doctorId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetMedicalCertificatesQuery(patientId, doctorId), ct);
        return Ok(ApiResponse<IReadOnlyList<MedicalCertificateDto>>.Success(result));
    }

    [HttpPost("referrals")]
    [HasPermission(ClinicPermissions.DocumentsIssue)]
    public async Task<ActionResult<ApiResponse<ReferralLetterDto>>> IssueReferralLetter(
        [FromBody] IssueReferralLetterCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ReferralLetterDto>.Success(result, "Clinical referral letter issued successfully."));
    }

    [HttpGet("referrals")]
    [HasPermission(ClinicPermissions.DocumentsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ReferralLetterDto>>>> GetReferralLetters(
        [FromQuery] Guid? patientId,
        [FromQuery] Guid? doctorId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetReferralLettersQuery(patientId, doctorId), ct);
        return Ok(ApiResponse<IReadOnlyList<ReferralLetterDto>>.Success(result));
    }
}
