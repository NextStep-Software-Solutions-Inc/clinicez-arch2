using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IClinicDocumentPdfService
{
    byte[] GenerateInvoicePdf(
        Invoice invoice,
        FacilitySettings settings,
        StaffMember? doctor = null,
        Patient? patient = null,
        string? queueNumber = null);

    byte[] GenerateOfficialReceiptPdf(
        Invoice invoice,
        PaymentRecord? payment,
        FacilitySettings settings,
        StaffMember? doctor = null,
        Patient? patient = null,
        string? queueNumber = null);

    byte[] GenerateInvoicePreviewPdf(
        InvoicePreviewRequest preview,
        FacilitySettings settings,
        StaffMember? doctor = null,
        Patient? patient = null);
    byte[] GenerateMedicalCertificatePdf(
        MedicalCertificate cert,
        FacilitySettings settings,
        Patient? patient = null,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GenerateLabRequisitionSlipPdf(
        LabOrderSlipDto slip,
        FacilitySettings settings,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GeneratePrescriptionPdf(
        PrescriptionSlipDto slip,
        FacilitySettings settings,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GenerateReferralLetterPdf(
        ReferralLetter referral,
        FacilitySettings settings,
        Patient? patient = null,
        StaffMember? doctor = null,
        SignatureMode? signatureMode = null);

    byte[] GenerateReceptionPlacardPdf(
        FacilitySettings settings,
        string qrUrl,
        string? joinCode = null,
        string? expiresAtFormatted = null);

    // Statutory & Operational Reports
    byte[] GenerateDailyEodReportPdf(DailyEodReportDto report, FacilitySettings settings, string? preparedByName = null);
    byte[] GenerateMorbidityReportPdf(MorbidityReportDto report, FacilitySettings settings, string? preparedByName = null);
    byte[] GenerateTaxDiscountAuditReportPdf(TaxDiscountAuditReportDto report, FacilitySettings settings, string? preparedByName = null);
    byte[] GenerateDoctorSharesReportPdf(DoctorSharesReportDto report, FacilitySettings settings, string? preparedByName = null);
    byte[] GenerateClinicAnalyticsPdf(ClinicAnalyticsDto analytics, FacilitySettings settings, string? preparedByName = null);
}
