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
using ClinicEz.Shared.Documents.Configuration;
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
    private readonly IRepository<ReferralLetter> _referralRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork? _unitOfWork;

    public DocumentsController(
        ISender sender,
        IClinicDocumentPdfService pdfService,
        IRepository<MedicalCertificate> medCertRepo,
        IRepository<ReferralLetter> referralRepo,
        IRepository<StaffMember> staffRepo,
        IRepository<ClinicSettings> settingsRepo,
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork? unitOfWork = null)
    {
        _sender = sender;
        _pdfService = pdfService;
        _medCertRepo = medCertRepo;
        _referralRepo = referralRepo;
        _staffRepo = staffRepo;
        _settingsRepo = settingsRepo;
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
    }

    [HttpGet("medical-certificates/{id:guid}/pdf")]
    [HasPermission(ClinicPermissions.DocumentsRead)]
    public async Task<IActionResult> DownloadMedicalCertificatePdf(
        [FromRoute] Guid id,
        [FromQuery] bool? wet = null,
        CancellationToken ct = default)
    {
        var cert = await _medCertRepo.GetByIdAsync(id, ct);
        if (cert == null) return NotFound($"Medical certificate '{id}' was not found.");

        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = cert.TenantId,
            ClinicId = cert.ClinicId,
            ClinicName = "Clinic EZ Partner Medical Clinic"
        };

        var patient = await _patientRepo.GetByIdAsync(cert.PatientId, ct);
        var doctor = await _staffRepo.GetByIdAsync(cert.DoctorId, ct);
        var signatureMode = wet == true
            ? SignatureMode.WetSignature
            : (wet == false ? SignatureMode.ESignatureSpecimen : (doctor?.DefaultSignatureMode ?? SignatureMode.ESignatureSpecimen));

        var hadSecurityDigest = !string.IsNullOrWhiteSpace(cert.SecurityDigest);
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, patient, doctor, signatureMode);

        if (!hadSecurityDigest && _unitOfWork != null)
        {
            _medCertRepo.Update(cert);
            await _unitOfWork.SaveChangesAsync(ct);
        }

        return File(pdfBytes, "application/pdf", $"MedicalCertificate-{cert.CertificateNumber}.pdf");
    }

    [HttpGet("referrals/{id:guid}/pdf")]
    [HasPermission(ClinicPermissions.DocumentsRead)]
    public async Task<IActionResult> DownloadReferralLetterPdf(
        [FromRoute] Guid id,
        [FromQuery] bool? wet = null,
        CancellationToken ct = default)
    {
        var referral = await _referralRepo.GetByIdAsync(id, ct);
        if (referral == null) return NotFound($"Referral letter '{id}' was not found.");

        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = referral.TenantId,
            ClinicId = referral.ClinicId,
            ClinicName = "Clinic EZ Partner Medical Clinic"
        };

        var patient = await _patientRepo.GetByIdAsync(referral.PatientId, ct);
        var doctor = await _staffRepo.GetByIdAsync(referral.ReferringDoctorId, ct);
        var signatureMode = wet == true
            ? SignatureMode.WetSignature
            : (wet == false ? SignatureMode.ESignatureSpecimen : (doctor?.DefaultSignatureMode ?? SignatureMode.ESignatureSpecimen));

        var hadSecurityDigest = !string.IsNullOrWhiteSpace(referral.SecurityDigest);
        var pdfBytes = _pdfService.GenerateReferralLetterPdf(referral, settings, patient, doctor, signatureMode);

        if (!hadSecurityDigest && _unitOfWork != null)
        {
            _referralRepo.Update(referral);
            await _unitOfWork.SaveChangesAsync(ct);
        }

        return File(pdfBytes, "application/pdf", $"ReferralLetter-{referral.ReferralNumber}.pdf");
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
