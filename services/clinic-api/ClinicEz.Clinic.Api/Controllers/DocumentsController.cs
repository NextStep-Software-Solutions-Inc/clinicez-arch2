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
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/documents")]
public sealed class DocumentsController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IClinicDocumentPdfService _pdfService;
    private readonly IRepository<MedicalCertificate> _medCertRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;

    public DocumentsController(
        ISender sender,
        IClinicDocumentPdfService pdfService,
        IRepository<MedicalCertificate> medCertRepo,
        IRepository<ClinicSettings> settingsRepo,
        IRepository<ClinicPatient> patientRepo)
    {
        _sender = sender;
        _pdfService = pdfService;
        _medCertRepo = medCertRepo;
        _settingsRepo = settingsRepo;
        _patientRepo = patientRepo;
    }

    [HttpGet("medical-certificates/{id:guid}/pdf")]
    [HasPermission(ClinicPermissions.DocumentsRead)]
    public async Task<IActionResult> DownloadMedicalCertificatePdf(
        [FromRoute] Guid id,
        CancellationToken ct)
    {
        var cert = await _medCertRepo.GetByIdAsync(id, ct);
        if (cert == null) return NotFound($"Medical certificate '{id}' was not found.");

        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = cert.TenantId,
            ClinicId = cert.ClinicId,
            ClinicName = "ClinicEz Partner Medical Clinic"
        };

        var patient = await _patientRepo.GetByIdAsync(cert.PatientId, ct);
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, patient);
        return File(pdfBytes, "application/pdf", $"MedicalCertificate-{cert.CertificateNumber}.pdf");
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
