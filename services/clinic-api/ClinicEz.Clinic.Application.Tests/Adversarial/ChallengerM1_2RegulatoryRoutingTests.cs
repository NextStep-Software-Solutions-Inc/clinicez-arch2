using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Configuration;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Challenger M1_2 Test Suite:
/// Stress-tests and challenges:
/// 1. Regulatory PDEA S2 safeguard enforcement on dangerous drug prescriptions
///    under ?wet=false, ?wet=true, and omitted wet parameter.
/// 2. Clean prescription signature mode behavior under ?wet=true, ?wet=false, and omitted.
/// 3. Controller ?wet= routing across Medical Certificates, Referral Letters, and Lab Orders.
/// 4. Public document security digest verification resolution (/api/v1/documents/verify/{digest}).
/// </summary>
public class ChallengerM1_2RegulatoryRoutingTests
{
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();

    private static readonly byte[] Sample1x1PngBytes = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC");

    private static readonly string SamplePngDataUri =
        "data:image/png;base64," + Convert.ToBase64String(Sample1x1PngBytes);

    private static ClinicSettings CreateSampleClinicSettings(Guid clinicId, string tenantId = "tenant-test-01") =>
        new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Apex Family Outpatient & Specialty Clinic",
            LetterheadHeader = "APEX FAMILY OUTPATIENT CLINIC",
            LetterheadSubHeader = "DOH Licensed Ambulatory Center • PDEA Accredited Facility",
            LetterheadAddress = "742 Evergreen Terrace, Quezon City, Metro Manila",
            LetterheadContact = "Tel: (02) 8920-1122 • Mobile: +63 917 555 1234",
            LetterheadDohLto = "LTO-NCR-2026-9812",
            AccreditationNumber = "PHIC-ACC-998811",
            PrimaryColorHex = "#0D6963",
            PaperSize = "Letter"
        };

    private static PrescriptionSlipDto CreateSamplePrescriptionSlip(bool containsDangerousDrug)
    {
        var items = new List<PrescriptionSlipItemDto>();
        if (containsDangerousDrug)
        {
            items.Add(new PrescriptionSlipItemDto(
                ItemId: Guid.NewGuid(),
                GenericName: "Morphine Sulfate (PDEA S2 Regulated Substance)",
                BrandName: "MST Continus",
                Dosage: "30 mg",
                Form: "Controlled-Release Tablet",
                Sig: "Take 1 tablet every 12 hours for intractable malignant pain",
                Quantity: 14,
                DurationDays: 7,
                Refills: 0,
                IsDangerousDrug: true,
                Remarks: "Strict DOH-PDEA Yellow Prescription Mandate"
            ));
        }
        else
        {
            items.Add(new PrescriptionSlipItemDto(
                ItemId: Guid.NewGuid(),
                GenericName: "Amoxicillin + Clavulanic Acid",
                BrandName: "Augmentin",
                Dosage: "625 mg",
                Form: "Film-Coated Tablet",
                Sig: "Take 1 tablet twice daily with meals for 7 days",
                Quantity: 14,
                DurationDays: 7,
                Refills: 0,
                IsDangerousDrug: false,
                Remarks: "Complete full antibiotic course"
            ));
        }

        return new PrescriptionSlipDto(
            ConsultationId: Guid.NewGuid(),
            PrescriptionNumber: containsDangerousDrug ? "RX-2026-PDEA-001" : "RX-2026-CLEAN-001",
            IssuedAt: DateTime.UtcNow,
            ClinicName: "Apex Family Outpatient Clinic",
            ClinicAddress: "Quezon City, Philippines",
            ClinicContact: "Tel: (02) 8920-1122",
            DoctorName: "Dr. Maria Corazon Ramos, MD, FPCP",
            DoctorPrcLicense: "PRC-0089123",
            DoctorPtr: "PTR-QC-2026-8812",
            DoctorS2License: "S2-0918-99214-A1",
            DoctorSpecialization: "Internal Medicine & Oncology",
            PatientId: Guid.NewGuid(),
            PatientName: "Juan Dela Cruz",
            PatientAge: 45,
            PatientGender: "Male",
            PhilHealthNumber: "12-092817263-1",
            PatientAllergies: "None",
            ClinicalDiagnosis: containsDangerousDrug ? "Stage IV Pancreatic Carcinoma - Severe Chronic Pain" : "Acute Bacterial Sinusitis",
            SpecialInstructions: "Follow prescribed timing strictly",
            Items: items,
            PublicVerificationToken: "test-rx-token",
            PublicVerificationUrl: "https://clinicez.ph/verify/test-rx-token",
            QrPayload: "CLINICEZ:RX:RX-2026-001:test-rx-token",
            DispenseStatus: "Pending",
            DispensedPharmacyName: null,
            DispensedPharmacistName: null,
            DispensedPharmacistPrc: null,
            DispensedReceiptNumber: null,
            DispensedReceiptUrl: null,
            DispensedAt: null,
            DispenseNotes: null
        );
    }

    // =========================================================================
    // 1. DANGEROUS DRUG PDEA S2 SAFEGUARD CHALLENGE TESTS
    // =========================================================================

    [Fact]
    public async Task PrescriptionsController_WithDangerousDrug_WhenWetFalse_MustStillEnforceWetSignatureAndRenderWarningBadge()
    {
        // ARRANGE: A caller actively tries to bypass PDEA S2 wet mode by supplying ?wet=false!
        var consultationId = Guid.NewGuid();
        var slip = CreateSamplePrescriptionSlip(containsDangerousDrug: true);
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.ConsultationId == consultationId), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new PrescriptionsController(sender, _pdfService, settingsRepo);

        // ACT: Attempt ?wet=false on dangerous drug prescription
        var result = await controller.DownloadPrescriptionPdfByConsultationId(consultationId, wet: false, CancellationToken.None);

        // ASSERT: Result must be FileContentResult
        result.Should().BeOfType<FileContentResult>();
        var fileResult = (FileContentResult)result;
        fileResult.ContentType.Should().Be("application/pdf");
        fileResult.FileDownloadName.Should().Be($"Prescription-{slip.PrescriptionNumber}.pdf");
        fileResult.FileContents.Should().NotBeNull();
        fileResult.FileContents.Length.Should().BeGreaterThan(1000);

        var pdfText = ExtractTextFromPdf(fileResult.FileContents);

        // 1. Must contain statutory PDEA S2 warning badge text
        pdfText.Should().ContainAny("PDEA S2", "Dangerous Drug", "DOH-PDEA", "Regulated Substance", "Wet signature",
            "Dangerous drug prescriptions MUST include statutory PDEA S2 regulatory warning even if ?wet=false was passed!");
        pdfText.Should().ContainAny("Wet signature", "physical prescription pad", "recommended/required", "Dangerous Drug",
            "Statutory warning text must advise physical wet signature");

        // 2. Must SUPPRESS electronic digital seal badge ("Officially Signed")
        pdfText.Should().NotContain("Officially Signed",
            "Dangerous drug prescriptions MUST suppress digital seal badge to enforce physical ink signing!");

        // 3. Must PRESERVE cryptographic verification security hash and QR code
        pdfText.Should().Contain("Security Hash",
            "Tamper-evident verification hash must be preserved in document footer!");
    }

    [Fact]
    public async Task PrescriptionsController_WithDangerousDrug_WhenWetTrue_MustEnforceWetSignatureAndRenderWarningBadge()
    {
        var consultationId = Guid.NewGuid();
        var slip = CreateSamplePrescriptionSlip(containsDangerousDrug: true);
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.ConsultationId == consultationId), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new PrescriptionsController(sender, _pdfService, settingsRepo);

        // ACT: Request ?wet=true
        var result = await controller.DownloadPrescriptionPdfByConsultationId(consultationId, wet: true, CancellationToken.None);

        result.Should().BeOfType<FileContentResult>();
        var fileResult = (FileContentResult)result;
        var pdfText = ExtractTextFromPdf(fileResult.FileContents);

        pdfText.Should().ContainAny("PDEA S2", "Dangerous Drug", "DOH-PDEA", "Regulated Substance", "Wet signature");
        pdfText.Should().NotContain("Officially Signed");
        pdfText.Should().Contain("Security Hash");
    }

    [Fact]
    public async Task PrescriptionsController_WithDangerousDrug_WhenWetOmitted_MustEnforceWetSignatureAndRenderWarningBadge()
    {
        var consultationId = Guid.NewGuid();
        var slip = CreateSamplePrescriptionSlip(containsDangerousDrug: true);
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.ConsultationId == consultationId), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new PrescriptionsController(sender, _pdfService, settingsRepo);

        // ACT: Omit wet parameter (?wet= omitted / null)
        var result = await controller.DownloadPrescriptionPdfByConsultationId(consultationId, wet: null, CancellationToken.None);

        result.Should().BeOfType<FileContentResult>();
        var fileResult = (FileContentResult)result;
        var pdfText = ExtractTextFromPdf(fileResult.FileContents);

        pdfText.Should().ContainAny("PDEA S2", "Dangerous Drug", "DOH-PDEA", "Regulated Substance", "Wet signature");
        pdfText.Should().NotContain("Officially Signed");
        pdfText.Should().Contain("Security Hash");
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    [InlineData(null)]
    public async Task PrescriptionsController_ByPrescriptionNumber_WithDangerousDrug_AcrossAllWetModes_MustEnforceWetSignature(bool? wetParam)
    {
        var slip = CreateSamplePrescriptionSlip(containsDangerousDrug: true);
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.PrescriptionNumber == slip.PrescriptionNumber), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new PrescriptionsController(sender, _pdfService, settingsRepo);

        // ACT
        var result = await controller.DownloadPrescriptionPdfByNumber(slip.PrescriptionNumber, wet: wetParam, CancellationToken.None);

        result.Should().BeOfType<FileContentResult>();
        var fileResult = (FileContentResult)result;
        var pdfText = ExtractTextFromPdf(fileResult.FileContents);

        pdfText.Should().ContainAny("PDEA S2", "Dangerous Drug", "DOH-PDEA", "Regulated Substance", "Wet signature");
        pdfText.Should().NotContain("Officially Signed");
        pdfText.Should().Contain("Security Hash");
    }

    // =========================================================================
    // 2. CLEAN PRESCRIPTION (NO DANGEROUS DRUGS) ROUTING CHALLENGE TESTS
    // =========================================================================

    [Fact]
    public async Task PrescriptionsController_CleanPrescription_WhenWetFalse_ShouldHonorESignatureMode()
    {
        var consultationId = Guid.NewGuid();
        var slip = CreateSamplePrescriptionSlip(containsDangerousDrug: false);
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.ConsultationId == consultationId), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new PrescriptionsController(sender, _pdfService, settingsRepo);

        // ACT: Clean prescription with wet: false
        var result = await controller.DownloadPrescriptionPdfByConsultationId(consultationId, wet: false, CancellationToken.None);

        result.Should().BeOfType<FileContentResult>();
        var fileResult = (FileContentResult)result;
        var pdfText = ExtractTextFromPdf(fileResult.FileContents);

        // Should NOT contain PDEA warning
        pdfText.Should().NotContain("Dangerous Drug");
        // SHOULD contain digital certification badge
        pdfText.Should().ContainAny("Digitally Certified", "Officially Signed", "PRC Lic. No.");
        // Should contain security hash
        pdfText.Should().Contain("Security Hash");
    }

    [Fact]
    public async Task PrescriptionsController_CleanPrescription_WhenWetTrue_ShouldEnforceWetModeAndSuppressDigitalSeal()
    {
        var consultationId = Guid.NewGuid();
        var slip = CreateSamplePrescriptionSlip(containsDangerousDrug: false);
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.ConsultationId == consultationId), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new PrescriptionsController(sender, _pdfService, settingsRepo);

        // ACT: Doctor explicitly requested wet signature for clean prescription (?wet=true)
        var result = await controller.DownloadPrescriptionPdfByConsultationId(consultationId, wet: true, CancellationToken.None);

        result.Should().BeOfType<FileContentResult>();
        var fileResult = (FileContentResult)result;
        var pdfText = ExtractTextFromPdf(fileResult.FileContents);

        // No dangerous drugs -> no PDEA warning
        pdfText.Should().NotContain("Dangerous Drug");
        // Wet mode requested -> digital seal badge MUST be suppressed
        pdfText.Should().NotContain("Officially Signed");
        // Security hash must remain
        pdfText.Should().Contain("Security Hash");
    }

    [Fact]
    public async Task PrescriptionsController_CleanPrescription_WhenWetOmitted_ShouldDefaultToESignatureMode()
    {
        var consultationId = Guid.NewGuid();
        var slip = CreateSamplePrescriptionSlip(containsDangerousDrug: false);
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.ConsultationId == consultationId), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new PrescriptionsController(sender, _pdfService, settingsRepo);

        // ACT: wet parameter omitted (null)
        var result = await controller.DownloadPrescriptionPdfByConsultationId(consultationId, wet: null, CancellationToken.None);

        result.Should().BeOfType<FileContentResult>();
        var fileResult = (FileContentResult)result;
        var pdfText = ExtractTextFromPdf(fileResult.FileContents);

        pdfText.Should().NotContain("Dangerous Drug");
        pdfText.Should().ContainAny("Digitally Certified", "Officially Signed", "PRC Lic. No.");
        pdfText.Should().Contain("Security Hash");
    }

    // =========================================================================
    // 3. CONTROLLER ?wet= ROUTING ACROSS OTHER DOCUMENT TYPES
    // =========================================================================

    [Fact]
    public async Task DocumentsController_MedicalCertificate_WetModeRouting_ShouldSuppressDigitalBadgeAndPreserveDigest()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var sender = Substitute.For<ISender>();

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test-01",
            ClinicId = clinicId,
            FirstName = "Allan",
            LastName = "Ramos",
            PrcLicenseNumber = "PRC-0056789",
            SignatureSpecimen = SamplePngDataUri,
            DefaultSignatureMode = SignatureMode.ESignatureSpecimen
        };
        await staffRepo.AddAsync(doctor, CancellationToken.None);

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test-01",
            ClinicId = clinicId,
            CertificateNumber = "MC-20261020-0077",
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara",
            DoctorId = doctor.Id,
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-0056789",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Diagnosis = "Acute Bronchitis",
            FitnessStatus = "UnfitToWork",
            Purpose = "Sick Leave",
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        await medCertRepo.AddAsync(cert, CancellationToken.None);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo);

        // 1. When wet: true -> suppresses digital badge
        var wetResult = await controller.DownloadMedicalCertificatePdf(cert.Id, wet: true, CancellationToken.None);
        wetResult.Should().BeOfType<FileContentResult>();
        var wetPdf = ExtractTextFromPdf(((FileContentResult)wetResult).FileContents);
        wetPdf.Should().NotContain("Digitally Certified & Locked");
        wetPdf.Should().Contain("Security Hash");

        // 2. When wet: false -> includes digital badge
        var eSignResult = await controller.DownloadMedicalCertificatePdf(cert.Id, wet: false, CancellationToken.None);
        eSignResult.Should().BeOfType<FileContentResult>();
        var eSignPdf = ExtractTextFromPdf(((FileContentResult)eSignResult).FileContents);
        eSignPdf.Should().Contain("Digitally Certified & Locked");
        eSignPdf.Should().Contain("Security Hash");
    }

    [Fact]
    public async Task DocumentsController_ReferralLetter_WetModeRouting_ShouldSuppressDigitalBadgeAndPreserveDigest()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var sender = Substitute.For<ISender>();

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test-01",
            ClinicId = clinicId,
            FirstName = "Allan",
            LastName = "Ramos",
            PrcLicenseNumber = "PRC-0056789",
            SignatureSpecimen = SamplePngDataUri,
            DefaultSignatureMode = SignatureMode.ESignatureSpecimen
        };
        await staffRepo.AddAsync(doctor, CancellationToken.None);

        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test-01",
            ClinicId = clinicId,
            ReferralNumber = "REF-20261020-0088",
            PatientId = Guid.NewGuid(),
            PatientName = "Juanito Cruz",
            ReferringDoctorId = doctor.Id,
            ReferringDoctorName = "Dr. Allan Ramos",
            ReferredToDoctor = "Dr. Roberto Cruz",
            ReferredToFacility = "Philippine Heart Center",
            ReferredDepartment = "Cardiology",
            ReferralDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Urgency = "Urgent",
            ProvisionalDiagnosis = "Hypertensive Emergency",
            ReasonForReferral = "Coronary evaluation",
            ClinicalSummary = "Severe chest pain",
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        await referralRepo.AddAsync(referral, CancellationToken.None);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo);

        // 1. When wet: true -> suppresses digital badge
        var wetResult = await controller.DownloadReferralLetterPdf(referral.Id, wet: true, CancellationToken.None);
        var wetPdf = ExtractTextFromPdf(((FileContentResult)wetResult).FileContents);
        wetPdf.Should().NotContain("Digitally Certified");
        wetPdf.Should().Contain("Security Hash");

        // 2. When wet: false -> includes digital badge
        var eSignResult = await controller.DownloadReferralLetterPdf(referral.Id, wet: false, CancellationToken.None);
        var eSignPdf = ExtractTextFromPdf(((FileContentResult)eSignResult).FileContents);
        eSignPdf.Should().ContainAny("Digitally Certified", "Clinical Referral", "PRC Lic. No.");
        eSignPdf.Should().Contain("Security Hash");
    }

    [Fact]
    public async Task LabOrdersController_LabOrderSlip_WetModeRouting_ShouldSuppressDigitalBadgeAndPreserveDigest()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var orderId = Guid.NewGuid();
        var slip = new LabOrderSlipDto(
            OrderId: orderId,
            OrderNumber: "ORD-20261020-0099",
            OrderDate: DateTime.UtcNow,
            ClinicName: "Apex Clinic",
            ClinicAddress: "Quezon City",
            ClinicContact: "Tel: (02) 8920-1122",
            DoctorName: "Dr. Maria Kristine Cruz",
            DoctorPrcLicense: "0108924",
            DoctorPtr: "PTR-QC-8912",
            PatientId: Guid.NewGuid(),
            PatientName: "Juan Dela Cruz",
            PatientAge: 40,
            PatientGender: "Male",
            PhilHealthNumber: "12-092817263-1",
            ClinicalDiagnosis: "Annual Physical Exam",
            FastingInstructions: "10-hour fasting",
            Items: new List<LabOrderSlipItemDto>
            {
                new("Complete Blood Count (CBC)", "Hematology", "EDTA tube")
            },
            PublicUploadUrl: "https://clinicez.ph/upload/lab-tok-0099",
            QrPayload: "CLINICEZ:REQ:ORD-20261020-0099"
        );

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetClinicLabOrderSlipQuery>(q => q.OrderId == orderId), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new LabOrdersController(sender, _pdfService, settingsRepo);

        // 1. When wet: true -> suppresses digital badge
        var wetResult = await controller.DownloadLabOrderSlipPdf(orderId, wet: true, CancellationToken.None);
        var wetPdf = ExtractTextFromPdf(((FileContentResult)wetResult).FileContents);
        wetPdf.Should().NotContain("Digitally Certified & Locked");
        wetPdf.Should().Contain("Security Hash");

        // 2. When wet: false -> includes digital badge
        var eSignResult = await controller.DownloadLabOrderSlipPdf(orderId, wet: false, CancellationToken.None);
        var eSignPdf = ExtractTextFromPdf(((FileContentResult)eSignResult).FileContents);
        eSignPdf.Should().Contain("Digitally Certified & Locked");
        eSignPdf.Should().Contain("Security Hash");
    }

    // =========================================================================
    // 4. SECURITY DIGEST VERIFICATION RESOLUTION (/verify/{digest})
    // =========================================================================

    [Fact]
    public async Task DocumentsController_VerifyDocument_SecurityDigestResolution_MedicalCertificate()
    {
        var testDigest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var sender = Substitute.For<ISender>();

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test-01",
            ClinicId = clinicId,
            CertificateNumber = "MC-20261020-0055",
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara De Los Santos",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-0056789",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Diagnosis = "Acute Bronchitis",
            FitnessStatus = "UnfitToWork",
            RecommendedRestDays = 3,
            Purpose = "Employment",
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            SecurityDigest = testDigest
        };
        await medCertRepo.AddAsync(cert, CancellationToken.None);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo);

        // ACT 1: Verify using exact 64-char security digest
        var resultByDigest = await controller.VerifyDocument(testDigest, CancellationToken.None);
        resultByDigest.Result.Should().BeOfType<OkObjectResult>();
        var okResult1 = (OkObjectResult)resultByDigest.Result!;
        var resp1 = (ApiResponse<DocumentVerificationResultDto>)okResult1.Value!;
        resp1.Data.Should().NotBeNull();
        resp1.Data!.IsVerified.Should().BeTrue();
        resp1.Data.DocumentType.Should().Be("Medical Certificate");
        resp1.Data.DocumentNumber.Should().Be("MC-20261020-0055");
        resp1.Data.SecurityDigest.Should().Be(testDigest);
        resp1.Data.PatientMaskedName.Should().Be("M***a C***a D* L*s S****s");

        // ACT 2: Verify using certificate number
        var resultByNumber = await controller.VerifyDocument("MC-20261020-0055", CancellationToken.None);
        resultByNumber.Result.Should().BeOfType<OkObjectResult>();

        // ACT 3: Verify with leading/trailing whitespaces around digest
        var resultWithWhitespace = await controller.VerifyDocument($"   {testDigest}   ", CancellationToken.None);
        resultWithWhitespace.Result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task DocumentsController_VerifyDocument_SecurityDigestResolution_ReferralLetter()
    {
        var testDigest = "7d865e959b2466918c9863afca942d0fb89d7c9ac0c99bafc3749504ded97730";
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var sender = Substitute.For<ISender>();

        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test-01",
            ClinicId = clinicId,
            ReferralNumber = "REF-20261020-0099",
            PatientId = Guid.NewGuid(),
            PatientName = "Juanito Dela Cruz",
            ReferringDoctorId = Guid.NewGuid(),
            ReferringDoctorName = "Dr. Roberto Cruz",
            ReferredToDoctor = "Dr. Teresa Lim",
            ReferredToFacility = "Philippine Heart Center",
            ReferredDepartment = "Cardiology",
            ReferralDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Urgency = "Urgent",
            ProvisionalDiagnosis = "Hypertensive Emergency",
            ReasonForReferral = "Coronary Angiography",
            ClinicalSummary = "Chest pain",
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            SecurityDigest = testDigest
        };
        await referralRepo.AddAsync(referral, CancellationToken.None);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo);

        // ACT
        var result = await controller.VerifyDocument(testDigest, CancellationToken.None);
        result.Result.Should().BeOfType<OkObjectResult>();
        var okResult = (OkObjectResult)result.Result!;
        var resp = (ApiResponse<DocumentVerificationResultDto>)okResult.Value!;
        resp.Data.Should().NotBeNull();
        resp.Data!.IsVerified.Should().BeTrue();
        resp.Data.DocumentType.Should().Be("Clinical Referral Letter");
        resp.Data.DocumentNumber.Should().Be("REF-20261020-0099");
        resp.Data.SecurityDigest.Should().Be(testDigest);
    }

    [Fact]
    public async Task DocumentsController_VerifyDocument_SecurityDigestResolution_ElectronicPrescription()
    {
        var rxToken = "rx-verify-tok-abcdef-123456";
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var sender = Substitute.For<ISender>();

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test-01",
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Enrique Gil",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Roberto Gomez",
            DoctorPrcLicense = "0089123",
            EncounterDate = DateTime.UtcNow,
            PrescriptionNumber = "RX-20261020-0044",
            RxPublicVerificationToken = rxToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued
        };
        await encounterRepo.AddAsync(encounter, CancellationToken.None);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo);

        // ACT
        var result = await controller.VerifyDocument(rxToken, CancellationToken.None);
        result.Result.Should().BeOfType<OkObjectResult>();
        var okResult = (OkObjectResult)result.Result!;
        var resp = (ApiResponse<DocumentVerificationResultDto>)okResult.Value!;
        resp.Data.Should().NotBeNull();
        resp.Data!.IsVerified.Should().BeTrue();
        resp.Data.DocumentType.Should().Be("Electronic Prescription (e-Rx)");
        resp.Data.DocumentNumber.Should().Be("RX-20261020-0044");
    }

    [Fact]
    public async Task DocumentsController_VerifyDocument_SecurityDigestResolution_DiagnosticRequisitionSlip()
    {
        var claimToken = "lab-token-claim-778899";
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var sender = Substitute.For<ISender>();

        var labOrder = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test-01",
            ClinicId = clinicId,
            OrderNumber = "ORD-20261020-0011",
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara De Los Santos",
            OrderedByDoctorId = Guid.NewGuid(),
            OrderedByDoctorName = "Dr. Maria Kristine Cruz",
            OrderDate = DateTime.UtcNow,
            ClaimToken = claimToken,
            Status = LabOrderStatus.Ordered
        };
        await labOrderRepo.AddAsync(labOrder, CancellationToken.None);
        await settingsRepo.AddAsync(CreateSampleClinicSettings(clinicId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo);

        // ACT
        var result = await controller.VerifyDocument(claimToken, CancellationToken.None);
        result.Result.Should().BeOfType<OkObjectResult>();
        var okResult = (OkObjectResult)result.Result!;
        var resp = (ApiResponse<DocumentVerificationResultDto>)okResult.Value!;
        resp.Data.Should().NotBeNull();
        resp.Data!.IsVerified.Should().BeTrue();
        resp.Data.DocumentType.Should().Be("Diagnostic Requisition Slip");
        resp.Data.DocumentNumber.Should().Be("ORD-20261020-0011");
    }

    [Fact]
    public async Task DocumentsController_VerifyDocument_UnknownDigestOrTampered_ShouldReturn404NotFound()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test-01");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var sender = Substitute.For<ISender>();

        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo);

        // ACT: Request verification for non-existent digest
        var result = await controller.VerifyDocument("deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd", CancellationToken.None);

        // ASSERT: Must be NotFoundObjectResult
        result.Result.Should().BeOfType<NotFoundObjectResult>();
        var notFoundResult = (NotFoundObjectResult)result.Result!;
        var resp = (ApiResponse<DocumentVerificationResultDto>)notFoundResult.Value!;
        resp.Succeeded.Should().BeFalse();
        resp.Message.Should().Contain("No verified medical document was found matching the identifier or seal");
    }

    // =========================================================================
    // PDF CMAP & STREAM TEXT EXTRACTION UTILITY
    // =========================================================================

    private static string ExtractTextFromPdf(byte[] pdfBytes)
    {
        var sb = new StringBuilder();
        sb.Append(Encoding.UTF8.GetString(pdfBytes));

        var span = pdfBytes.AsSpan();
        var streamToken = "stream"u8;
        var endStreamToken = "endstream"u8;

        var decompressedStreams = new List<string>();

        int pos = 0;
        while (pos < pdfBytes.Length)
        {
            var streamIdx = span.Slice(pos).IndexOf(streamToken);
            if (streamIdx < 0) break;
            int streamStart = pos + streamIdx + streamToken.Length;
            if (streamStart < pdfBytes.Length && pdfBytes[streamStart] == '\r') streamStart++;
            if (streamStart < pdfBytes.Length && pdfBytes[streamStart] == '\n') streamStart++;

            var endIdx = span.Slice(streamStart).IndexOf(endStreamToken);
            if (endIdx < 0) break;
            int streamLength = endIdx;

            while (streamLength > 0 && (pdfBytes[streamStart + streamLength - 1] == '\r' || pdfBytes[streamStart + streamLength - 1] == '\n'))
            {
                streamLength--;
            }

            try
            {
                using var mem = new MemoryStream(pdfBytes, streamStart, streamLength);
                using var zlib = new ZLibStream(mem, CompressionMode.Decompress);
                using var reader = new StreamReader(zlib, Encoding.UTF8);
                var content = reader.ReadToEnd();
                sb.Append(content);
                decompressedStreams.Add(content);
            }
            catch
            {
                // Stream is not zlib or raw uncompressed image data, continue safely
            }

            pos = streamStart + endIdx + endStreamToken.Length;
        }

        // Parse ToUnicode CMaps
        var cmap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var stream in decompressedStreams)
        {
            if (!stream.Contains("begincmap")) continue;

            // 1. beginbfchar ... endbfchar
            int bfCharIdx = 0;
            while ((bfCharIdx = stream.IndexOf("beginbfchar", bfCharIdx, StringComparison.Ordinal)) >= 0)
            {
                int endBfChar = stream.IndexOf("endbfchar", bfCharIdx, StringComparison.Ordinal);
                if (endBfChar < 0) break;

                var block = stream.Substring(bfCharIdx, endBfChar - bfCharIdx);
                var matches = System.Text.RegularExpressions.Regex.Matches(block, @"<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>");
                foreach (System.Text.RegularExpressions.Match m in matches)
                {
                    var src = m.Groups[1].Value;
                    var dstHex = m.Groups[2].Value;
                    var dstSb = new StringBuilder();
                    for (int i = 0; i < dstHex.Length; i += 4)
                    {
                        if (i + 4 <= dstHex.Length && int.TryParse(dstHex.Substring(i, 4), System.Globalization.NumberStyles.HexNumber, null, out int codePoint))
                        {
                            dstSb.Append((char)codePoint);
                        }
                    }
                    cmap[src] = dstSb.ToString();
                }
                bfCharIdx = endBfChar + 9;
            }

            // 2. beginbfrange ... endbfrange
            int bfRangeIdx = 0;
            while ((bfRangeIdx = stream.IndexOf("beginbfrange", bfRangeIdx, StringComparison.Ordinal)) >= 0)
            {
                int endBfRange = stream.IndexOf("endbfrange", bfRangeIdx, StringComparison.Ordinal);
                if (endBfRange < 0) break;

                var block = stream.Substring(bfRangeIdx, endBfRange - bfRangeIdx);
                var matches = System.Text.RegularExpressions.Regex.Matches(block, @"<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>");
                foreach (System.Text.RegularExpressions.Match m in matches)
                {
                    if (int.TryParse(m.Groups[1].Value, System.Globalization.NumberStyles.HexNumber, null, out int startSrc) &&
                        int.TryParse(m.Groups[2].Value, System.Globalization.NumberStyles.HexNumber, null, out int endSrc) &&
                        int.TryParse(m.Groups[3].Value, System.Globalization.NumberStyles.HexNumber, null, out int startDst))
                    {
                        for (int s = startSrc, d = startDst; s <= endSrc; s++, d++)
                        {
                            cmap[s.ToString("X4")] = ((char)d).ToString();
                        }
                    }
                }
                bfRangeIdx = endBfRange + 10;
            }
        }

        // If we have CMap entries, decode hex strings in content streams
        if (cmap.Count > 0)
        {
            var decodedSb = new StringBuilder();
            foreach (var stream in decompressedStreams)
            {
                if (stream.Contains("begincmap")) continue;

                // Match <00240033...>
                var hexMatches = System.Text.RegularExpressions.Regex.Matches(stream, @"<([0-9A-Fa-f]{4,})>");
                foreach (System.Text.RegularExpressions.Match m in hexMatches)
                {
                    var hex = m.Groups[1].Value;
                    for (int i = 0; i + 4 <= hex.Length; i += 4)
                    {
                        if (i + 4 <= hex.Length)
                        {
                            var code = hex.Substring(i, 4);
                            if (cmap.TryGetValue(code, out var ch))
                            {
                                decodedSb.Append(ch);
                            }
                        }
                    }
                    decodedSb.Append(' ');
                }

                // Also match literal strings (text)
                var litMatches = System.Text.RegularExpressions.Regex.Matches(stream, @"\(([^)]+)\)");
                foreach (System.Text.RegularExpressions.Match m in litMatches)
                {
                    decodedSb.Append(m.Groups[1].Value).Append(' ');
                }
            }
            var decoded = decodedSb.ToString();
            var collapsed = System.Text.RegularExpressions.Regex.Replace(decoded, @"(?<=[A-Za-z0-9]) (?=[A-Za-z0-9])", "");
            var normalized = System.Text.RegularExpressions.Regex.Replace(collapsed, @"\s+", " ");
            var cleaned = System.Text.RegularExpressions.Regex.Replace(normalized, @"\s+([:;,.?!/])", "$1");
            sb.Append("\n--- DECODED TEXT ---\n");
            sb.Append(decoded);
            sb.Append("\n--- NORMALIZED TEXT ---\n");
            sb.Append(normalized);
            sb.Append("\n--- CLEANED TEXT ---\n");
            sb.Append(cleaned);
            sb.Append("\n--- SPACELESS TEXT ---\n");
            sb.Append(System.Text.RegularExpressions.Regex.Replace(decoded, @"\s+", ""));
        }

        return sb.ToString();
    }
}
