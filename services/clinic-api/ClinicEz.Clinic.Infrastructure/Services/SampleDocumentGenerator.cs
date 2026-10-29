using System;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Encapsulates sample document PDF generation for previewing stationery and print templates.
/// </summary>
public class SampleDocumentGenerator : ISampleDocumentGenerator
{
    private readonly IClinicDocumentPdfService _pdfService;

    public SampleDocumentGenerator(IClinicDocumentPdfService pdfService)
    {
        _pdfService = pdfService ?? throw new ArgumentNullException(nameof(pdfService));
    }

    public (byte[] PdfBytes, string FileName) GenerateSamplePdf(
        string docType,
        bool wetSignature,
        string? paperSize,
        FacilitySettings settings)
    {
        if (settings == null) throw new ArgumentNullException(nameof(settings));

        if (!string.IsNullOrWhiteSpace(paperSize))
        {
            settings.PaperSize = paperSize;
        }

        var signatureMode = wetSignature ? SignatureMode.WetSignature : SignatureMode.ESignatureSpecimen;
        var sampleDoctor = SampleDocumentFixtures.CreateSampleDoctor(settings, signatureMode);
        var samplePatient = SampleDocumentFixtures.CreateSamplePatient(settings);

        var normalizedType = (docType ?? string.Empty).ToLowerInvariant();

        if (normalizedType.Contains("presc") || normalizedType.Contains("rx"))
        {
            var slip = SampleDocumentFixtures.CreateSamplePrescriptionSlip(settings, samplePatient, sampleDoctor);
            var bytes = _pdfService.GeneratePrescriptionPdf(slip, settings, sampleDoctor, signatureMode);
            return (bytes, "Sample-ElectronicPrescription.pdf");
        }

        if (normalizedType.Contains("lab") || normalizedType.Contains("req"))
        {
            var slip = SampleDocumentFixtures.CreateSampleLabOrderSlip(settings, samplePatient, sampleDoctor);
            var bytes = _pdfService.GenerateLabRequisitionSlipPdf(slip, settings, sampleDoctor, signatureMode);
            return (bytes, "Sample-LabRequisitionSlip.pdf");
        }

        if (normalizedType.Contains("ref"))
        {
            var referral = SampleDocumentFixtures.CreateSampleReferralLetter(settings, samplePatient, sampleDoctor);
            var bytes = _pdfService.GenerateReferralLetterPdf(referral, settings, samplePatient, sampleDoctor, signatureMode);
            return (bytes, "Sample-ClinicalReferralLetter.pdf");
        }

        if (normalizedType.Contains("placard") || normalizedType.Contains("reception") || normalizedType.Contains("qr"))
        {
            var (qrUrl, joinCode, expiresAt) = SampleDocumentFixtures.CreateSampleReceptionPlacardParams();
            var bytes = _pdfService.GenerateReceptionPlacardPdf(settings, qrUrl, joinCode, expiresAt);
            return (bytes, "Sample-ReceptionQrPlacard.pdf");
        }

        if (normalizedType.Contains("eod") || normalizedType.Contains("end of day") || normalizedType.Contains("daily"))
        {
            var eod = SampleDocumentFixtures.CreateSampleDailyEodReport(settings);
            var bytes = _pdfService.GenerateDailyEodReportPdf(eod, settings, "Maria Santos, Cashier");
            return (bytes, "Sample-DailyEodReport.pdf");
        }

        if (normalizedType.Contains("morbidity") || normalizedType.Contains("doh"))
        {
            var morbidity = SampleDocumentFixtures.CreateSampleMorbidityReport(settings);
            var bytes = _pdfService.GenerateMorbidityReportPdf(morbidity, settings, "Dr. Allan Ramos, MD");
            return (bytes, "Sample-DohOutpatientMorbidityReport.pdf");
        }

        if (normalizedType.Contains("tax") || normalizedType.Contains("discount") || normalizedType.Contains("bir"))
        {
            var taxAudit = SampleDocumentFixtures.CreateSampleTaxDiscountAuditReport(settings);
            var bytes = _pdfService.GenerateTaxDiscountAuditReportPdf(taxAudit, settings, "Maria Santos, Billing Officer");
            return (bytes, "Sample-BirTaxDiscountAuditReport.pdf");
        }

        if (normalizedType.Contains("share") || normalizedType.Contains("doctor") || normalizedType.Contains("settlement"))
        {
            var docShares = SampleDocumentFixtures.CreateSampleDoctorSharesReport(settings, sampleDoctor);
            var bytes = _pdfService.GenerateDoctorSharesReportPdf(docShares, settings, "Clinic Medical Director");
            return (bytes, "Sample-DoctorSharesSettlement.pdf");
        }

        if (normalizedType.Contains("analytics") || normalizedType.Contains("executive"))
        {
            var analytics = SampleDocumentFixtures.CreateSampleClinicAnalytics(settings);
            var bytes = _pdfService.GenerateClinicAnalyticsPdf(analytics, settings, "Executive Audit");
            return (bytes, "Sample-ExecutiveAnalyticsSummary.pdf");
        }

        // Default: Medical Certificate
        var cert = SampleDocumentFixtures.CreateSampleMedicalCertificate(settings, samplePatient, sampleDoctor);
        var certBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, samplePatient, sampleDoctor, signatureMode);
        return (certBytes, "Sample-MedicalCertificate.pdf");
    }
}
