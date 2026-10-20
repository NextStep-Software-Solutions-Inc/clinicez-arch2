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
using ClinicEz.Clinic.Application.Features.Documents.Commands;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Configuration;
using ClinicEz.Shared.Documents.Security;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

public class RemediationM1SecurityDigestPersistenceTests
{
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();
    private readonly IDocumentSecurityService _securityService = new DocumentSecurityService();

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

    [Fact]
    public async Task IssueMedicalCertificateCommand_Should_Persist_SecurityDigest_To_Database()
    {
        var testClinicId = Guid.NewGuid();
        var testTenantId = "tenant-test-01";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(testClinicId);
        clinicContext.TenantId.Returns(testTenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        await settingsRepo.AddAsync(CreateSampleClinicSettings(testClinicId, testTenantId), CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = Phase3TestKit.MedCert(medCertRepo, uow, clinicContext, db);

        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var certDto = await handler.Handle(new IssueMedicalCertificateCommand(
            patientId,
            "Juan Dela Cruz",
            null,
            doctorId,
            "Dr. Maria Ramos",
            "PRC-009988",
            "PTR-12345",
            "Acute Bronchitis",
            "Cough and fever"
        ), CancellationToken.None);

        // 1. Verify entity in DB has non-null SecurityDigest
        var savedCert = await medCertRepo.GetByIdAsync(certDto.Id, CancellationToken.None);
        savedCert.Should().NotBeNull();
        savedCert!.SecurityDigest.Should().NotBeNullOrWhiteSpace();
        savedCert.SecurityDigest!.Should().StartWith("SEC-SHA256-");

        // 2. Verify DocumentsController.VerifyDocument resolves with this persisted digest
        var sender = Substitute.For<ISender>();
        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo, uow);

        var verifyResult = await controller.VerifyDocument(savedCert.SecurityDigest!, CancellationToken.None);
        verifyResult.Result.Should().BeOfType<OkObjectResult>();
        var ok = (OkObjectResult)verifyResult.Result!;
        var response = (ApiResponse<DocumentVerificationResultDto>)ok.Value!;
        response.Data.Should().NotBeNull();
        response.Data!.IsVerified.Should().BeTrue();
        response.Data.DocumentNumber.Should().Be(savedCert.CertificateNumber);
        response.Data.SecurityDigest.Should().Be(savedCert.SecurityDigest);
    }

    [Fact]
    public async Task IssueReferralLetterCommand_Should_Persist_SecurityDigest_To_Database()
    {
        var testClinicId = Guid.NewGuid();
        var testTenantId = "tenant-test-01";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(testClinicId);
        clinicContext.TenantId.Returns(testTenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        await settingsRepo.AddAsync(CreateSampleClinicSettings(testClinicId, testTenantId), CancellationToken.None);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = testTenantId,
            ClinicId = testClinicId,
            FirstName = "Maria",
            LastName = "Ramos",
            PrcLicenseNumber = "PRC-007788"
        };
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new IssueReferralLetterCommandHandler(referralRepo, uow, clinicContext, _securityService, staffRepo);

        var patientId = Guid.NewGuid();

        var refDto = await handler.Handle(new IssueReferralLetterCommand(
            patientId,
            "Pedro Penduko",
            null,
            doctor.Id,
            "Dr. Maria Ramos",
            "Dr. Jose Santos",
            "Philippine General Hospital",
            "Cardiology",
            "Urgent",
            "Refractory Angina",
            "Unstable Angina",
            "Progressive chest tightness",
            "Aspirin 80mg OD",
            "ECG attached"
        ), CancellationToken.None);

        // 1. Verify entity in DB has non-null SecurityDigest
        var savedRef = await referralRepo.GetByIdAsync(refDto.Id, CancellationToken.None);
        savedRef.Should().NotBeNull();
        savedRef!.SecurityDigest.Should().NotBeNullOrWhiteSpace();
        savedRef.SecurityDigest!.Should().StartWith("SEC-SHA256-");

        // 2. Verify DocumentsController.VerifyDocument resolves with this persisted digest
        var sender = Substitute.For<ISender>();
        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo, uow);

        var verifyResult = await controller.VerifyDocument(savedRef.SecurityDigest!, CancellationToken.None);
        verifyResult.Result.Should().BeOfType<OkObjectResult>();
        var ok = (OkObjectResult)verifyResult.Result!;
        var response = (ApiResponse<DocumentVerificationResultDto>)ok.Value!;
        response.Data.Should().NotBeNull();
        response.Data!.IsVerified.Should().BeTrue();
        response.Data.DocumentNumber.Should().Be(savedRef.ReferralNumber);
        response.Data.SecurityDigest.Should().Be(savedRef.SecurityDigest);
    }

    [Fact]
    public async Task DocumentsController_DownloadMedicalCertificatePdf_Backfills_Null_SecurityDigest_To_Database()
    {
        var testClinicId = Guid.NewGuid();
        var testTenantId = "tenant-test-01";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(testClinicId);
        clinicContext.TenantId.Returns(testTenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        await settingsRepo.AddAsync(CreateSampleClinicSettings(testClinicId, testTenantId), CancellationToken.None);

        // Legacy cert without SecurityDigest
        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = testTenantId,
            ClinicId = testClinicId,
            CertificateNumber = "MC-20261020-LEGACY-01",
            PatientId = Guid.NewGuid(),
            PatientName = "Legacy Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-0056789",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Diagnosis = "Asthma Exacerbation",
            FitnessStatus = "UnfitToWork",
            Purpose = "Sick Leave",
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            SecurityDigest = null // <-- NULL legacy document
        };
        await medCertRepo.AddAsync(cert, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var sender = Substitute.For<ISender>();
        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo, uow);

        // ACT: Download PDF
        var actionResult = await controller.DownloadMedicalCertificatePdf(cert.Id, wet: false, CancellationToken.None);
        actionResult.Should().BeOfType<FileContentResult>();

        // ASSERT: Entity in DB has now been backfilled with SecurityDigest
        var backfilledCert = await medCertRepo.GetByIdAsync(cert.Id, CancellationToken.None);
        backfilledCert.Should().NotBeNull();
        backfilledCert!.SecurityDigest.Should().NotBeNullOrWhiteSpace();
        backfilledCert.SecurityDigest!.Should().StartWith("SEC-SHA256-");

        // Verify document can now be resolved by that backfilled digest
        var verifyResult = await controller.VerifyDocument(backfilledCert.SecurityDigest!, CancellationToken.None);
        verifyResult.Result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task DocumentsController_DownloadReferralLetterPdf_Backfills_Null_SecurityDigest_To_Database()
    {
        var testClinicId = Guid.NewGuid();
        var testTenantId = "tenant-test-01";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(testClinicId);
        clinicContext.TenantId.Returns(testTenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        await settingsRepo.AddAsync(CreateSampleClinicSettings(testClinicId, testTenantId), CancellationToken.None);

        // Legacy referral without SecurityDigest
        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = testTenantId,
            ClinicId = testClinicId,
            ReferralNumber = "REF-20261020-LEGACY-02",
            PatientId = Guid.NewGuid(),
            PatientName = "Legacy Patient Two",
            ReferringDoctorId = Guid.NewGuid(),
            ReferringDoctorName = "Dr. Allan Ramos",
            ReferredToDoctor = "Dr. Garcia",
            ReferredToFacility = "National Kidney Institute",
            ReferredDepartment = "Nephrology",
            ReferralDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Urgency = "Routine",
            ReasonForReferral = "CKD evaluation",
            ProvisionalDiagnosis = "Chronic Kidney Disease Stage 3b",
            ClinicalSummary = "Elevated creatinine",
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            SecurityDigest = null // <-- NULL legacy document
        };
        await referralRepo.AddAsync(referral, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var sender = Substitute.For<ISender>();
        var controller = new DocumentsController(
            sender, _pdfService, medCertRepo, referralRepo, staffRepo,
            encounterRepo, labOrderRepo, settingsRepo, patientRepo, uow);

        // ACT: Download PDF
        var actionResult = await controller.DownloadReferralLetterPdf(referral.Id, wet: false, CancellationToken.None);
        actionResult.Should().BeOfType<FileContentResult>();

        // ASSERT: Entity in DB has now been backfilled with SecurityDigest
        var backfilledRef = await referralRepo.GetByIdAsync(referral.Id, CancellationToken.None);
        backfilledRef.Should().NotBeNull();
        backfilledRef!.SecurityDigest.Should().NotBeNullOrWhiteSpace();
        backfilledRef.SecurityDigest!.Should().StartWith("SEC-SHA256-");

        // Verify document can now be resolved by that backfilled digest
        var verifyResult = await controller.VerifyDocument(backfilledRef.SecurityDigest!, CancellationToken.None);
        verifyResult.Result.Should().BeOfType<OkObjectResult>();
    }
}
