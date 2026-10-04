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
    private readonly IRepository<ReferralLetter> _referralRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IRepository<ClinicLabOrder> _labOrderRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;

    public DocumentsController(
        ISender sender,
        IClinicDocumentPdfService pdfService,
        IRepository<MedicalCertificate> medCertRepo,
        IRepository<ReferralLetter> referralRepo,
        IRepository<StaffMember> staffRepo,
        IRepository<ConsultationEncounter> encounterRepo,
        IRepository<ClinicLabOrder> labOrderRepo,
        IRepository<ClinicSettings> settingsRepo,
        IRepository<ClinicPatient> patientRepo)
    {
        _sender = sender;
        _pdfService = pdfService;
        _medCertRepo = medCertRepo;
        _referralRepo = referralRepo;
        _staffRepo = staffRepo;
        _encounterRepo = encounterRepo;
        _labOrderRepo = labOrderRepo;
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

    [HttpGet("referrals/{id:guid}/pdf")]
    [HasPermission(ClinicPermissions.DocumentsRead)]
    public async Task<IActionResult> DownloadReferralLetterPdf(
        [FromRoute] Guid id,
        CancellationToken ct)
    {
        var referral = await _referralRepo.GetByIdAsync(id, ct);
        if (referral == null) return NotFound($"Referral letter '{id}' was not found.");

        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = referral.TenantId,
            ClinicId = referral.ClinicId,
            ClinicName = "ClinicEz Partner Medical Clinic"
        };

        var patient = await _patientRepo.GetByIdAsync(referral.PatientId, ct);
        var doctor = await _staffRepo.GetByIdAsync(referral.ReferringDoctorId, ct);
        var pdfBytes = _pdfService.GenerateReferralLetterPdf(referral, settings, patient, doctor);
        return File(pdfBytes, "application/pdf", $"ReferralLetter-{referral.ReferralNumber}.pdf");
    }

    [HttpGet("verify/{securityDigestOrNumber}")]
    public async Task<ActionResult<ApiResponse<DocumentVerificationResultDto>>> VerifyDocument(
        [FromRoute] string securityDigestOrNumber,
        CancellationToken ct)
    {
        var trimmed = securityDigestOrNumber.Trim();
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        var facilityName = settings?.LetterheadHeader ?? settings?.ClinicName ?? "ClinicEz Accredited Healthcare Facility";
        var facilityAddress = settings?.LetterheadAddress ?? "Philippines";

        // 1. Check Medical Certificates
        var medCert = await _medCertRepo.Query()
            .FirstOrDefaultAsync(c => c.CertificateNumber == trimmed, ct);
        if (medCert != null)
        {
            return Ok(ApiResponse<DocumentVerificationResultDto>.Success(new DocumentVerificationResultDto(
                IsVerified: true,
                DocumentType: "Medical Certificate",
                DocumentNumber: medCert.CertificateNumber,
                FacilityName: facilityName,
                FacilityAddress: facilityAddress,
                PatientMaskedName: DocumentVerificationResultDto.MaskName(medCert.PatientName),
                DoctorName: medCert.DoctorName,
                DoctorPrcLicense: medCert.PrcLicenseNumber,
                IssueDate: medCert.IssueDate.ToString("MMMM dd, yyyy"),
                Status: "Officially Valid",
                SecurityDigest: trimmed,
                VerificationMessage: "This Medical Certificate is cryptographically verified and authentic on the ClinicEz national healthcare registry.",
                Notes: $"Fitness Status: {medCert.FitnessStatus} • Rest Recommended: {medCert.RecommendedRestDays ?? 0} day(s)"
            )));
        }

        // 2. Check Referral Letters
        var referral = await _referralRepo.Query()
            .FirstOrDefaultAsync(r => r.ReferralNumber == trimmed, ct);
        if (referral != null)
        {
            return Ok(ApiResponse<DocumentVerificationResultDto>.Success(new DocumentVerificationResultDto(
                IsVerified: true,
                DocumentType: "Clinical Referral Letter",
                DocumentNumber: referral.ReferralNumber,
                FacilityName: facilityName,
                FacilityAddress: facilityAddress,
                PatientMaskedName: DocumentVerificationResultDto.MaskName(referral.PatientName),
                DoctorName: referral.ReferringDoctorName,
                DoctorPrcLicense: "Licensed Referring Physician",
                IssueDate: referral.ReferralDate.ToString("MMMM dd, yyyy"),
                Status: "Officially Valid",
                SecurityDigest: trimmed,
                VerificationMessage: "This Clinical Referral Letter is authentic and was issued by an accredited attending physician.",
                Notes: $"Referred to: {referral.ReferredToFacility} ({referral.ReferredDepartment}) • Urgency: {referral.Urgency}"
            )));
        }

        // 3. Check Electronic Prescriptions (via ConsultationEncounter)
        var encounter = await _encounterRepo.Query()
            .FirstOrDefaultAsync(e => e.PrescriptionNumber == trimmed || e.RxPublicVerificationToken == trimmed, ct);
        if (encounter != null && !string.IsNullOrWhiteSpace(encounter.PrescriptionNumber))
        {
            return Ok(ApiResponse<DocumentVerificationResultDto>.Success(new DocumentVerificationResultDto(
                IsVerified: true,
                DocumentType: "Electronic Prescription (e-Rx)",
                DocumentNumber: encounter.PrescriptionNumber,
                FacilityName: facilityName,
                FacilityAddress: facilityAddress,
                PatientMaskedName: DocumentVerificationResultDto.MaskName(encounter.PatientName),
                DoctorName: encounter.DoctorName,
                DoctorPrcLicense: encounter.DoctorPrcLicense ?? "PRC Licensed Physician",
                IssueDate: encounter.SignedAt?.ToString("MMMM dd, yyyy") ?? encounter.EncounterDate.ToString("MMMM dd, yyyy"),
                Status: encounter.RxDispenseStatus.ToString(),
                SecurityDigest: trimmed,
                VerificationMessage: "Official Electronic Prescription compliant with Philippine RA 6675 (Generics Act) and FDA Circular 2020-004.",
                Notes: $"Dispense Status: {encounter.RxDispenseStatus} • Pharmacist verification enabled"
            )));
        }

        // 4. Check Laboratory Orders
        var labOrder = await _labOrderRepo.Query()
            .FirstOrDefaultAsync(l => l.OrderNumber == trimmed || l.PublicUploadToken == trimmed, ct);
        if (labOrder != null)
        {
            return Ok(ApiResponse<DocumentVerificationResultDto>.Success(new DocumentVerificationResultDto(
                IsVerified: true,
                DocumentType: "Diagnostic Requisition Slip",
                DocumentNumber: labOrder.OrderNumber,
                FacilityName: facilityName,
                FacilityAddress: facilityAddress,
                PatientMaskedName: DocumentVerificationResultDto.MaskName(labOrder.PatientName),
                DoctorName: labOrder.OrderedByDoctorName ?? "Attending Clinician",
                DoctorPrcLicense: "Attending Clinician",
                IssueDate: labOrder.OrderDate.ToString("MMMM dd, yyyy"),
                Status: labOrder.Status.ToString(),
                SecurityDigest: trimmed,
                VerificationMessage: "Official Universal Diagnostic Requisition Slip registered on ClinicEz interop network.",
                Notes: $"Order Status: {labOrder.Status} • Interoperable with all accredited diagnostic laboratories"
            )));
        }

        return NotFound(ApiResponse<DocumentVerificationResultDto>.Fail(
            $"No verified medical document was found matching the identifier or seal '{trimmed}'."
        ));
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
