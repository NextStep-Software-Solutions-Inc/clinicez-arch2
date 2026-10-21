using System;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents.Configuration;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Services;

public class SampleDocumentGeneratorTests
{
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();
    private readonly ISampleDocumentGenerator _generator;

    public SampleDocumentGeneratorTests()
    {
        _generator = new SampleDocumentGenerator(_pdfService);
    }

    [Theory]
    [InlineData("Medical Certificate", "Sample-MedicalCertificate.pdf")]
    [InlineData("medcert", "Sample-MedicalCertificate.pdf")]
    [InlineData("Prescription", "Sample-ElectronicPrescription.pdf")]
    [InlineData("rx", "Sample-ElectronicPrescription.pdf")]
    [InlineData("Lab Request", "Sample-LabRequisitionSlip.pdf")]
    [InlineData("requisition", "Sample-LabRequisitionSlip.pdf")]
    [InlineData("Referral Letter", "Sample-ClinicalReferralLetter.pdf")]
    [InlineData("Reception Placard", "Sample-ReceptionQrPlacard.pdf")]
    [InlineData("Daily EOD Report", "Sample-DailyEodReport.pdf")]
    [InlineData("Morbidity Report", "Sample-DohOutpatientMorbidityReport.pdf")]
    [InlineData("doh", "Sample-DohOutpatientMorbidityReport.pdf")]
    [InlineData("Tax/Discount Audit", "Sample-BirTaxDiscountAuditReport.pdf")]
    [InlineData("bir", "Sample-BirTaxDiscountAuditReport.pdf")]
    [InlineData("Doctor Shares Settlement", "Sample-DoctorSharesSettlement.pdf")]
    [InlineData("Clinic Analytics Summary", "Sample-ExecutiveAnalyticsSummary.pdf")]
    public void GenerateSamplePdf_ReturnsValidPdfAndExpectedFileName(string docType, string expectedFileName)
    {
        var settings = new ClinicSettings
        {
            TenantId = "tenant-sample",
            ClinicName = "Test Sample Clinic",
            LetterheadHeader = "TEST CLINICAL CENTER",
            LetterheadAddress = "123 Medical Way",
            LetterheadContact = "Tel: 555-0100"
        };

        var (pdfBytes, fileName) = _generator.GenerateSamplePdf(docType, wetSignature: false, paperSize: "A4", settings);

        fileName.Should().Be(expectedFileName);
        pdfBytes.Should().NotBeNullOrEmpty();
        // PDF magic header: %PDF-
        pdfBytes.Length.Should().BeGreaterThan(100);
        pdfBytes[0].Should().Be(0x25); // %
        pdfBytes[1].Should().Be(0x50); // P
        pdfBytes[2].Should().Be(0x44); // D
        pdfBytes[3].Should().Be(0x46); // F
    }

    [Fact]
    public void GenerateSamplePdf_SupportsWetSignatureAndCustomPaperSize()
    {
        var settings = new ClinicSettings
        {
            TenantId = "tenant-sample",
            ClinicName = "Test Sample Clinic"
        };

        var (pdfBytes, fileName) = _generator.GenerateSamplePdf("Medical Certificate", wetSignature: true, paperSize: "Letter", settings);

        settings.PaperSize.Should().Be("Letter");
        fileName.Should().Be("Sample-MedicalCertificate.pdf");
        pdfBytes.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void GenerateSamplePdf_ThrowsWhenSettingsIsNull()
    {
        var act = () => _generator.GenerateSamplePdf("Medical Certificate", false, null, null!);
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void SampleDocumentFixtures_ProduceNonEmptyModels()
    {
        var settings = new ClinicSettings { TenantId = "t-1", ClinicName = "Sample Clinic" };
        var doctor = SampleDocumentFixtures.CreateSampleDoctor(settings, SignatureMode.WetSignature);
        var patient = SampleDocumentFixtures.CreateSamplePatient(settings);

        doctor.Should().NotBeNull();
        doctor.FirstName.Should().NotBeNullOrWhiteSpace();
        doctor.DefaultSignatureMode.Should().Be(SignatureMode.WetSignature);

        patient.Should().NotBeNull();
        patient.PatientCode.Should().NotBeNullOrWhiteSpace();

        var rx = SampleDocumentFixtures.CreateSamplePrescriptionSlip(settings, patient, doctor);
        rx.Items.Should().NotBeEmpty();

        var lab = SampleDocumentFixtures.CreateSampleLabOrderSlip(settings, patient, doctor);
        lab.Items.Should().NotBeEmpty();

        var refLetter = SampleDocumentFixtures.CreateSampleReferralLetter(settings, patient, doctor);
        refLetter.ReferralNumber.Should().NotBeNullOrWhiteSpace();

        var eod = SampleDocumentFixtures.CreateSampleDailyEodReport(settings);
        eod.CollectionsByMethod.Should().NotBeEmpty();
        eod.DoctorWorkloads.Should().NotBeEmpty();

        var morb = SampleDocumentFixtures.CreateSampleMorbidityReport(settings);
        morb.Diseases.Should().NotBeEmpty();

        var tax = SampleDocumentFixtures.CreateSampleTaxDiscountAuditReport(settings);
        tax.Items.Should().NotBeEmpty();

        var shares = SampleDocumentFixtures.CreateSampleDoctorSharesReport(settings, doctor);
        shares.DoctorShares.Should().NotBeEmpty();

        var analytics = SampleDocumentFixtures.CreateSampleClinicAnalytics(settings);
        analytics.RevenueTrend.Should().NotBeEmpty();

        var cert = SampleDocumentFixtures.CreateSampleMedicalCertificate(settings, patient, doctor);
        cert.CertificateNumber.Should().NotBeNullOrWhiteSpace();
    }
}
