using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IClinicDocumentPdfService
{
    byte[] GenerateMedicalCertificatePdf(
        MedicalCertificate cert,
        ClinicSettings settings,
        ClinicPatient? patient = null,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GenerateLabRequisitionSlipPdf(
        LabOrderSlipDto slip,
        ClinicSettings settings,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GeneratePrescriptionPdf(
        PrescriptionSlipDto slip,
        ClinicSettings settings,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GenerateReferralLetterPdf(
        ReferralLetter referral,
        ClinicSettings settings,
        ClinicPatient? patient = null,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GenerateReceptionPlacardPdf(
        ClinicSettings settings,
        string qrUrl,
        string? joinCode = null,
        string? expiresAtFormatted = null);

    // Statutory & Operational Reports
    byte[] GenerateDailyEodReportPdf(DailyEodReportDto report, ClinicSettings settings, string? preparedByName = null);
    byte[] GenerateMorbidityReportPdf(MorbidityReportDto report, ClinicSettings settings, string? preparedByName = null);
    byte[] GenerateTaxDiscountAuditReportPdf(TaxDiscountAuditReportDto report, ClinicSettings settings, string? preparedByName = null);
    byte[] GenerateDoctorSharesReportPdf(DoctorSharesReportDto report, ClinicSettings settings, string? preparedByName = null);
    byte[] GenerateClinicAnalyticsPdf(ClinicAnalyticsDto analytics, ClinicSettings settings, string? preparedByName = null);
}
