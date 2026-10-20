using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Configuration;
using ClinicEz.Shared.Workspace;
using Microsoft.AspNetCore.Authorization;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/settings")]
public sealed class SettingsController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IClinicDocumentPdfService? _pdfService;
    private readonly IRepository<ClinicSettings>? _settingsRepo;

    public SettingsController(
        ISender sender,
        IClinicDocumentPdfService? pdfService = null,
        IRepository<ClinicSettings>? settingsRepo = null)
    {
        _sender = sender;
        _pdfService = pdfService;
        _settingsRepo = settingsRepo;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<ActionResult<ApiResponse<ClinicSettingsDto>>> GetSettings(CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicSettingsQuery(), ct);
        return Ok(ApiResponse<ClinicSettingsDto>.Success(result));
    }

    [HttpGet("reception-placard-pdf")]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<IActionResult> DownloadReceptionPlacardPdf(
        [FromQuery] string? qrUrl = null,
        [FromQuery] string? joinCode = null,
        [FromQuery] string? expiresAt = null,
        CancellationToken ct = default)
    {
        if (_pdfService == null)
        {
            return StatusCode(503, "PDF service is unavailable.");
        }

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query().FirstOrDefaultAsync(ct)
            : null;

        settings ??= new ClinicSettings
        {
            TenantId = "default",
            ClinicName = "Clinic EZ Partner Medical Clinic"
        };

        var pdfBytes = _pdfService.GenerateReceptionPlacardPdf(settings, qrUrl ?? string.Empty, joinCode, expiresAt);
        return File(pdfBytes, "application/pdf", "ReceptionPlacard.pdf");
    }

    [HttpGet("sample-document-pdf")]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<IActionResult> DownloadSampleDocumentPdf(
        [FromQuery] string docType = "Medical Certificate",
        [FromQuery] bool wet = false,
        [FromQuery] string? paperSize = null,
        CancellationToken ct = default)
    {
        if (_pdfService == null)
        {
            return StatusCode(503, "PDF service is unavailable.");
        }

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query().FirstOrDefaultAsync(ct)
            : null;

        settings ??= new ClinicSettings
        {
            TenantId = "default",
            ClinicName = "Clinic EZ Partner Medical Clinic",
            LetterheadHeader = "CLINIC EZ HEALTHCARE CENTER",
            LetterheadAddress = "124 Rizal Avenue, San Pedro, Laguna",
            LetterheadContact = "Tel: (02) 8876-5432 • Mobile: +63 917 123 4567"
        };

        if (!string.IsNullOrWhiteSpace(paperSize))
        {
            settings.PaperSize = paperSize;
        }

        var signatureMode = wet ? SignatureMode.WetSignature : SignatureMode.ESignatureSpecimen;
        var sampleDoctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            FirstName = "Roberto",
            LastName = "Santos",
            Title = "Dr.",
            Role = ClinicEz.Clinic.Domain.Enums.StaffRole.Doctor,
            Specialty = "Internal Medicine",
            PrcLicenseNumber = "0098451",
            PtrNumber = "8472910",
            S2LicenseNumber = "S2-2026-9912",
            DefaultSignatureMode = signatureMode
        };

        var samplePatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            PatientCode = "PAT-2026-0001",
            ContactNumber = "+63 917 123 4567",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1998, 4, 12),
            Gender = "Female",
            PhilHealthNumber = "PHIC-ACC-2026-9912"
        };

        var normalizedType = docType.ToLowerInvariant();
        byte[] pdfBytes;
        string fileName;

        if (normalizedType.Contains("presc") || normalizedType.Contains("rx"))
        {
            var slip = new PrescriptionSlipDto(
                ConsultationId: Guid.NewGuid(),
                PrescriptionNumber: "RX-2026-00891",
                IssuedAt: DateTime.UtcNow,
                ClinicName: settings.ClinicName,
                ClinicAddress: settings.LetterheadAddress ?? "Philippines",
                ClinicContact: settings.LetterheadContact ?? "Tel: (02) 8876-5432",
                DoctorName: "DR. ROBERTO V. SANTOS, MD, FPCP",
                DoctorPrcLicense: "0098451",
                DoctorPtr: "8472910",
                DoctorS2License: "S2-2026-9912",
                DoctorSpecialization: "Internal Medicine",
                PatientId: samplePatient.Id,
                PatientName: "Maria Santos",
                PatientAge: 28,
                PatientGender: "Female",
                PhilHealthNumber: "PHIC-ACC-2026-9912",
                PatientAllergies: "None",
                ClinicalDiagnosis: "Acute Upper Respiratory Tract Infection",
                SpecialInstructions: "Take after meals. Complete full 7-day course of antibiotic.",
                Items: new List<PrescriptionSlipItemDto>
                {
                    new(Guid.NewGuid(), "Amoxicillin + Clavulanic Acid", null, "625mg", "tablet", "Take 1 tablet twice daily with meals for 7 days.", 14, 7, 0, false, null),
                    new(Guid.NewGuid(), "Paracetamol", null, "500mg", "tablet", "Take 1 tablet every 4 hours PRN for fever >= 38.0°C or severe pain.", 20, 3, 0, false, null)
                },
                PublicVerificationToken: "sample-rx-verify-tok",
                PublicVerificationUrl: "https://clinicez.ph/verify/sample-rx-verify-tok",
                QrPayload: "CLINICEZ:RX:RX-2026-00891:sample-rx-verify-tok",
                DispenseStatus: "Pending",
                DispensedPharmacyName: null,
                DispensedPharmacistName: null,
                DispensedPharmacistPrc: null,
                DispensedReceiptNumber: null,
                DispensedReceiptUrl: null,
                DispensedAt: null,
                DispenseNotes: null
            );
            pdfBytes = _pdfService.GeneratePrescriptionPdf(slip, settings, sampleDoctor, signatureMode);
            fileName = "Sample-ElectronicPrescription.pdf";
        }
        else if (normalizedType.Contains("lab") || normalizedType.Contains("req"))
        {
            var slip = new LabOrderSlipDto(
                OrderId: Guid.NewGuid(),
                OrderNumber: "LAB-2026-00318",
                OrderDate: DateTime.UtcNow,
                ClinicName: settings.ClinicName,
                ClinicAddress: settings.LetterheadAddress ?? "Philippines",
                ClinicContact: settings.LetterheadContact ?? "Tel: (02) 8876-5432",
                DoctorName: "DR. ROBERTO V. SANTOS, MD, FPCP",
                DoctorPrcLicense: "0098451",
                DoctorPtr: "8472910",
                PatientId: samplePatient.Id,
                PatientName: "Pedro Penduko",
                PatientAge: 45,
                PatientGender: "Male",
                PhilHealthNumber: "PHIC-ACC-2026-9912",
                ClinicalDiagnosis: "Annual Executive Health Wellness & Primary Hypertension Evaluation.",
                FastingInstructions: "10 to 12 hours fasting required prior to blood extraction.",
                Items: new List<LabOrderSlipItemDto>
                {
                    new("Complete Blood Count (CBC) with Platelet Count", "Hematology", "EDTA tube collection"),
                    new("Fasting Blood Sugar (FBS)", "Clinical Chemistry", "10-12 hours fasting required"),
                    new("Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)", "Clinical Chemistry", "10-12 hours fasting required"),
                    new("12-Lead Electrocardiogram (ECG)", "Cardiology", "Standard resting 12-lead protocol")
                },
                PublicUploadUrl: "https://clinicez.ph/upload/sample-lab-tok",
                QrPayload: "CLINICEZ:REQ:LAB-2026-00318"
            );
            pdfBytes = _pdfService.GenerateLabRequisitionSlipPdf(slip, settings, sampleDoctor, signatureMode);
            fileName = "Sample-LabRequisitionSlip.pdf";
        }
        else if (normalizedType.Contains("ref"))
        {
            var referral = new ReferralLetter
            {
                Id = Guid.NewGuid(),
                TenantId = settings.TenantId,
                ClinicId = settings.ClinicId,
                ReferralNumber = "REF-2026-00105",
                PatientId = samplePatient.Id,
                PatientName = "Juan Dela Cruz",
                ReferringDoctorId = sampleDoctor.Id,
                ReferringDoctorName = "DR. ROBERTO V. SANTOS, MD, FPCP",
                ReferredToDoctor = "Attending Cardiologist / Specialist",
                ReferredToFacility = "Philippine Heart Center",
                ReferredDepartment = "East Avenue, Diliman, Quezon City",
                ReferralDate = DateOnly.FromDateTime(DateTime.UtcNow),
                Urgency = "Routine",
                ProvisionalDiagnosis = "Grade 2 Essential Hypertension & Cardiovascular Risk Evaluation",
                ReasonForReferral = "For specialist cardiology assessment and 24-hr ambulatory blood pressure monitoring.",
                ClinicalSummary = "58-year-old male with persistent elevated blood pressure refractory to initial single-agent therapy.",
                CurrentMedications = "Amlodipine 10mg OD",
                AttachedDiagnostics = "12-Lead ECG: Normal Sinus Rhythm; Fasting Blood Chemistry attached.",
                IsSigned = true,
                SignedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "DR. ROBERTO V. SANTOS, MD"
            };
            var refPatient = new ClinicPatient
            {
                Id = Guid.NewGuid(),
                TenantId = settings.TenantId,
                PatientCode = "PAT-2026-00105",
                ContactNumber = "+63 917 123 4567",
                FirstName = "Juan",
                LastName = "Dela Cruz",
                DateOfBirth = new DateOnly(1968, 5, 14),
                Gender = "Male",
                PhilHealthNumber = "PHIC-ACC-2026-9912"
            };
            pdfBytes = _pdfService.GenerateReferralLetterPdf(referral, settings, refPatient, sampleDoctor, signatureMode);
            fileName = "Sample-ClinicalReferralLetter.pdf";
        }
        else
        {
            var cert = new MedicalCertificate
            {
                Id = Guid.NewGuid(),
                TenantId = settings.TenantId,
                ClinicId = settings.ClinicId,
                CertificateNumber = "MC-2026-0042",
                PatientId = samplePatient.Id,
                PatientName = "Juan Dela Cruz",
                DoctorId = sampleDoctor.Id,
                DoctorName = "DR. ROBERTO V. SANTOS, MD, FPCP",
                PrcLicenseNumber = "0098451",
                PtrNumber = "8472910",
                IssueDate = DateOnly.FromDateTime(DateTime.UtcNow),
                Diagnosis = "Acute Upper Respiratory Tract Infection (ICD-10 J06.9)",
                ClinicalFindings = "Mild pharyngeal congestion, clear breath sounds, normal vital signs.",
                FitnessStatus = "FitToWork",
                RecommendedRestDays = 3,
                RestStartDate = DateOnly.FromDateTime(DateTime.UtcNow),
                RestEndDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2)),
                Purpose = "employment verification and medical leave",
                Remarks = "Patient was advised home rest and conservative management for three (3) consecutive days. Fit to resume employment activities thereafter.",
                IsSigned = true,
                SignedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "DR. ROBERTO V. SANTOS, MD"
            };
            var medCertPatient = new ClinicPatient
            {
                Id = Guid.NewGuid(),
                TenantId = settings.TenantId,
                PatientCode = "PAT-2026-0042",
                ContactNumber = "+63 917 123 4567",
                FirstName = "Juan",
                LastName = "Dela Cruz",
                DateOfBirth = new DateOnly(1992, 10, 20),
                Gender = "Male",
                PhilHealthNumber = "PHIC-ACC-2026-9912"
            };
            pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, medCertPatient, sampleDoctor, signatureMode);
            fileName = "Sample-MedicalCertificate.pdf";
        }

        return File(pdfBytes, "application/pdf", fileName);
    }

    /// <summary>
    /// Workspace brand (display name, logo, accent) and regional defaults inherited from the tenant's workspace.
    /// Any signed-in staff member may read it - the console uses it to theme itself.
    /// </summary>
    [HttpGet("workspace-profile")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<WorkspaceProfile>>> GetWorkspaceProfile(CancellationToken ct)
    {
        var profile = await _sender.Send(new GetWorkspaceProfileQuery(), ct);
        return profile is null
            ? NotFound(ApiResponse<WorkspaceProfile>.Fail("Workspace profile is not available yet."))
            : Ok(ApiResponse<WorkspaceProfile>.Success(profile));
    }

    [HttpPut]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicSettingsDto>>> UpdateSettings(
        [FromBody] UpdateClinicSettingsCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicSettingsDto>.Success(result, "Clinic preferences updated successfully."));
    }
}
