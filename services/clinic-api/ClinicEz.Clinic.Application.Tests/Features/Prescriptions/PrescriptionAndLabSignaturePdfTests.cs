using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents.Configuration;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Prescriptions;

public sealed class PrescriptionAndLabSignaturePdfTests
{
    private readonly IClinicDocumentPdfService _realPdfService = new ClinicDocumentPdfService();

    private static readonly byte[] Sample1x1PngBytes = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC");

    private static readonly string SamplePngDataUri =
        "data:image/png;base64," + Convert.ToBase64String(Sample1x1PngBytes);

    private static (IClinicContext Context, Guid ClinicId, string TenantId) CreateClinicContext()
    {
        var clinicId = Guid.NewGuid();
        const string tenantId = "tenant-erx-sig-test";
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(clinicId);
        ctx.TenantId.Returns(tenantId);
        return (ctx, clinicId, tenantId);
    }

    private static FacilitySettings CreateSettings(Guid clinicId, string tenantId) => new()
    {
        Id = Guid.NewGuid(),
        ClinicId = clinicId,
        TenantId = tenantId,
        ClinicName = "St. Jude Primary Care Clinic",
        LetterheadAddress = "124 Rizal Avenue, San Pedro, Laguna",
        LetterheadContact = "Tel: (02) 8876-5432",
        PaperSize = "Letter"
    };

    private static StaffMember CreateDoctor(
        Guid clinicId,
        string tenantId,
        SignatureMode defaultMode,
        string? signatureSpecimen) => new()
    {
        Id = Guid.NewGuid(),
        ClinicId = clinicId,
        TenantId = tenantId,
        FirstName = "Elena",
        LastName = "Ramos",
        Title = "Dr.",
        Role = StaffRole.Doctor,
        Specialty = "Internal Medicine",
        PrcLicenseNumber = "PRC-0098765",
        PtrNumber = "PTR-2026-4411",
        S2LicenseNumber = "S2-112233-A",
        DefaultSignatureMode = defaultMode,
        SignatureSpecimen = signatureSpecimen
    };

    [Fact]
    public async Task GetPrescriptionSlipQuery_And_GetClinicLabOrderSlipQuery_PopulateDoctorId()
    {
        var (clinicContext, clinicId, tenantId) = CreateClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);

        var doctor = CreateDoctor(clinicId, tenantId, SignatureMode.ESignatureSpecimen, SamplePngDataUri);
        await staffRepo.AddAsync(doctor);
        await settingsRepo.AddAsync(CreateSettings(clinicId, tenantId));

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientCode = "PAT-2026-101",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 5, 10),
            Sex = BiologicalSex.Male,
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            DoctorId = doctor.Id,
            DoctorName = "Dr. Elena Ramos",
            PrescriptionNumber = "RX-2026-TEST-01",
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            Prescriptions =
            [
                new PrescriptionItem
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    TenantId = tenantId,
                    GenericName = "Amoxicillin",
                    Dosage = "500mg",
                    Form = "Capsule",
                    Sig = "Take 1 capsule every 8 hours for 7 days",
                    Quantity = 21
                }
            ]
        };
        await encounterRepo.AddAsync(encounter);

        var labOrder = new LabOrder
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            OrderNumber = "LAB-2026-TEST-01",
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            OrderedByDoctorId = doctor.Id,
            OrderedByDoctorName = "Dr. Elena Ramos",
            IsSigned = true,
            Items =
            [
                new LabOrderItem
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    TenantId = tenantId,
                    TestName = "Complete Blood Count",
                    Category = "Hematology"
                }
            ]
        };
        await labOrderRepo.AddAsync(labOrder);
        await uow.SaveChangesAsync();

        var rxHandler = new GetPrescriptionSlipQueryHandler(encounterRepo, patientRepo, staffRepo, settingsRepo, uow);
        var rxSlip = await rxHandler.Handle(new GetPrescriptionSlipQuery(ConsultationId: encounter.Id), CancellationToken.None);
        rxSlip.DoctorId.Should().Be(doctor.Id);

        var labHandler = new GetClinicLabOrderSlipQueryHandler(
            labOrderRepo, patientRepo, settingsRepo, staffRepo, Phase3TestKit.Grants(db), uow);
        var labSlip = await labHandler.Handle(new GetClinicLabOrderSlipQuery(labOrder.Id), CancellationToken.None);
        labSlip.DoctorId.Should().Be(doctor.Id);
    }

    [Fact]
    public async Task PrescriptionsController_BothPdfEndpoints_RenderSavedPngSpecimen_WhenWetOmitted()
    {
        var (clinicContext, clinicId, tenantId) = CreateClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        var doctor = CreateDoctor(clinicId, tenantId, SignatureMode.ESignatureSpecimen, SamplePngDataUri);
        await settingsRepo.AddAsync(CreateSettings(clinicId, tenantId));
        await staffRepo.AddAsync(doctor);
        await uow.SaveChangesAsync();

        var consultationId = Guid.NewGuid();
        var slip = CreatePrescriptionSlip(consultationId, "RX-2026-SIG-001", doctor.Id, isDangerousDrug: false);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.ConsultationId == consultationId), Arg.Any<CancellationToken>())
            .Returns(slip);
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.PrescriptionNumber == slip.PrescriptionNumber), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new PrescriptionsController(sender, _realPdfService, settingsRepo, staffRepo);

        // 1. By Consultation ID
        var byConsultResult = (FileContentResult)await controller.DownloadPrescriptionPdfByConsultationId(consultationId, wet: null, CancellationToken.None);
        AssertESignatureSpecimenRendered(byConsultResult.FileContents, expectedBaseImageCount: 1);

        // 2. By Prescription Number
        var byNumberResult = (FileContentResult)await controller.DownloadPrescriptionPdfByNumber(slip.PrescriptionNumber, wet: null, CancellationToken.None);
        AssertESignatureSpecimenRendered(byNumberResult.FileContents, expectedBaseImageCount: 1);
    }

    [Fact]
    public async Task LabOrdersController_DownloadLabOrderSlipPdf_RendersSavedPngSpecimen_WhenWetOmitted()
    {
        var (clinicContext, clinicId, tenantId) = CreateClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        var doctor = CreateDoctor(clinicId, tenantId, SignatureMode.ESignatureSpecimen, SamplePngDataUri);
        await settingsRepo.AddAsync(CreateSettings(clinicId, tenantId));
        await staffRepo.AddAsync(doctor);
        await uow.SaveChangesAsync();

        var orderId = Guid.NewGuid();
        var slip = CreateLabOrderSlip(orderId, "LAB-2026-SIG-001", doctor.Id);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetClinicLabOrderSlipQuery>(q => q.OrderId == orderId), Arg.Any<CancellationToken>())
            .Returns(slip);

        var controller = new LabOrdersController(sender, _realPdfService, settingsRepo, staffRepo);
        var result = (FileContentResult)await controller.DownloadLabOrderSlipPdf(orderId, wet: null, CancellationToken.None);

        // Lab slip renders 2 base QR codes (dropzone + footer) plus the clinician signature PNG
        AssertESignatureSpecimenRendered(result.FileContents, expectedBaseImageCount: 2);
    }

    [Fact]
    public async Task PrescriptionsController_And_LabOrdersController_RespectDoctorDefaultSignatureMode_WhenWetIsNull()
    {
        var (clinicContext, clinicId, tenantId) = CreateClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        // Doctor prefers WetSignature by default even though a PNG signature specimen is saved
        var wetDefaultDoctor = CreateDoctor(clinicId, tenantId, SignatureMode.WetSignature, SamplePngDataUri);
        await settingsRepo.AddAsync(CreateSettings(clinicId, tenantId));
        await staffRepo.AddAsync(wetDefaultDoctor);
        await uow.SaveChangesAsync();

        var consultationId = Guid.NewGuid();
        var orderId = Guid.NewGuid();
        var rxSlip = CreatePrescriptionSlip(consultationId, "RX-2026-WETDEF", wetDefaultDoctor.Id, isDangerousDrug: false);
        var labSlip = CreateLabOrderSlip(orderId, "LAB-2026-WETDEF", wetDefaultDoctor.Id);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.ConsultationId == consultationId), Arg.Any<CancellationToken>())
            .Returns(rxSlip);
        sender.Send(Arg.Is<GetClinicLabOrderSlipQuery>(q => q.OrderId == orderId), Arg.Any<CancellationToken>())
            .Returns(labSlip);

        // Verify controller passes loaded doctor & signatureMode: null when wet is omitted
        var mockPdf = Substitute.For<IClinicDocumentPdfService>();
        mockPdf.GeneratePrescriptionPdf(Arg.Any<PrescriptionSlipDto>(), Arg.Any<FacilitySettings>(), Arg.Any<StaffMember?>(), Arg.Any<SignatureMode?>())
            .Returns([0x25, 0x50, 0x44, 0x46]);
        mockPdf.GenerateLabRequisitionSlipPdf(Arg.Any<LabOrderSlipDto>(), Arg.Any<FacilitySettings>(), Arg.Any<StaffMember?>(), Arg.Any<SignatureMode?>())
            .Returns([0x25, 0x50, 0x44, 0x46]);

        var rxMockController = new PrescriptionsController(sender, mockPdf, settingsRepo, staffRepo);
        await rxMockController.DownloadPrescriptionPdfByConsultationId(consultationId, wet: null, CancellationToken.None);
        mockPdf.Received(1).GeneratePrescriptionPdf(
            rxSlip,
            Arg.Any<FacilitySettings>(),
            Arg.Is<StaffMember?>(d => d != null && d.Id == wetDefaultDoctor.Id && d.SignatureSpecimen == SamplePngDataUri),
            null);

        var labMockController = new LabOrdersController(sender, mockPdf, settingsRepo, staffRepo);
        await labMockController.DownloadLabOrderSlipPdf(orderId, wet: null, CancellationToken.None);
        mockPdf.Received(1).GenerateLabRequisitionSlipPdf(
            labSlip,
            Arg.Any<FacilitySettings>(),
            Arg.Is<StaffMember?>(d => d != null && d.Id == wetDefaultDoctor.Id && d.SignatureSpecimen == SamplePngDataUri),
            null);

        // Verify real PDF service honors doctor.DefaultSignatureMode == WetSignature when wet == null
        var rxRealController = new PrescriptionsController(sender, _realPdfService, settingsRepo, staffRepo);
        var rxWetByDefault = (FileContentResult)await rxRealController.DownloadPrescriptionPdfByConsultationId(consultationId, wet: null, CancellationToken.None);
        AssertWetSignatureRendered(rxWetByDefault.FileContents, expectedBaseImageCount: 1);

        var labRealController = new LabOrdersController(sender, _realPdfService, settingsRepo, staffRepo);
        var labWetByDefault = (FileContentResult)await labRealController.DownloadLabOrderSlipPdf(orderId, wet: null, CancellationToken.None);
        AssertWetSignatureRendered(labWetByDefault.FileContents, expectedBaseImageCount: 2);

        // Verify explicit ?wet=false overrides doctor.DefaultSignatureMode == WetSignature
        var rxOverrideESign = (FileContentResult)await rxRealController.DownloadPrescriptionPdfByConsultationId(consultationId, wet: false, CancellationToken.None);
        AssertESignatureSpecimenRendered(rxOverrideESign.FileContents, expectedBaseImageCount: 1);

        var labOverrideESign = (FileContentResult)await labRealController.DownloadLabOrderSlipPdf(orderId, wet: false, CancellationToken.None);
        AssertESignatureSpecimenRendered(labOverrideESign.FileContents, expectedBaseImageCount: 2);

        // Verify DigitalSealOnly default renders digital seal badge without embedding signature specimen image
        wetDefaultDoctor.DefaultSignatureMode = SignatureMode.DigitalSealOnly;
        await uow.SaveChangesAsync();

        var rxSealOnly = (FileContentResult)await rxRealController.DownloadPrescriptionPdfByConsultationId(consultationId, wet: null, CancellationToken.None);
        var rxSealText = ExtractTextFromPdf(rxSealOnly.FileContents);
        rxSealText.Should().Contain("Digitally Certified & Locked");
        rxSealText.Should().NotContain("[Clinician E-Signature Specimen Applied]");
        CountPdfImageXObjects(rxSealOnly.FileContents).Should().Be(1);

        var labSealOnly = (FileContentResult)await labRealController.DownloadLabOrderSlipPdf(orderId, wet: null, CancellationToken.None);
        var labSealText = ExtractTextFromPdf(labSealOnly.FileContents);
        labSealText.Should().Contain("Digitally Certified & Locked");
        labSealText.Should().NotContain("[Clinician E-Signature Specimen Applied]");
        CountPdfImageXObjects(labSealOnly.FileContents).Should().Be(2);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(false)]
    public async Task PrescriptionsController_WhenIsDangerousDrug_ForcesWetSignatureEvenWithESignatureSpecimen(bool? wet)
    {
        var (clinicContext, clinicId, tenantId) = CreateClinicContext();
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        var doctor = CreateDoctor(clinicId, tenantId, SignatureMode.ESignatureSpecimen, SamplePngDataUri);
        await settingsRepo.AddAsync(CreateSettings(clinicId, tenantId));
        await staffRepo.AddAsync(doctor);
        await uow.SaveChangesAsync();

        var consultationId = Guid.NewGuid();
        var dangerousSlip = CreatePrescriptionSlip(consultationId, "RX-2026-S2-001", doctor.Id, isDangerousDrug: true);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPrescriptionSlipQuery>(q => q.ConsultationId == consultationId), Arg.Any<CancellationToken>())
            .Returns(dangerousSlip);

        var controller = new PrescriptionsController(sender, _realPdfService, settingsRepo, staffRepo);
        var result = (FileContentResult)await controller.DownloadPrescriptionPdfByConsultationId(consultationId, wet: wet, CancellationToken.None);

        var text = ExtractTextFromPdf(result.FileContents);
        text.Should().Contain("PDEA S2");
        text.Should().NotContain("Digitally Certified & Locked");
        text.Should().NotContain("[Clinician E-Signature Specimen Applied]");
        // Only the QR code image should be embedded (signature specimen image must NOT be embedded)
        CountPdfImageXObjects(result.FileContents).Should().Be(1);
    }

    private static void AssertESignatureSpecimenRendered(byte[] pdfBytes, int expectedBaseImageCount)
    {
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(pdfBytes, 0, 5).Should().Be("%PDF-");

        var text = ExtractTextFromPdf(pdfBytes);
        text.Should().Contain("Digitally Certified & Locked");
        text.Should().NotContain("[Clinician E-Signature Specimen Applied]");

        // Base QR image(s) + clinician PNG signature specimen image (+ optional alpha SMask) must be embedded
        CountPdfImageXObjects(pdfBytes).Should().BeGreaterThan(expectedBaseImageCount);
    }

    private static void AssertWetSignatureRendered(byte[] pdfBytes, int expectedBaseImageCount)
    {
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);

        var text = ExtractTextFromPdf(pdfBytes);
        text.Should().NotContain("Digitally Certified & Locked");
        text.Should().NotContain("[Clinician E-Signature Specimen Applied]");

        // Only base QR image(s) embedded; no signature specimen image
        CountPdfImageXObjects(pdfBytes).Should().Be(expectedBaseImageCount);
    }

    private static int CountPdfImageXObjects(byte[] pdfBytes)
    {
        var raw = Encoding.Latin1.GetString(pdfBytes);
        return Regex.Matches(raw, @"/Subtype\s*/Image\b").Count;
    }

    private static PrescriptionSlipDto CreatePrescriptionSlip(
        Guid consultationId,
        string rxNumber,
        Guid doctorId,
        bool isDangerousDrug) => new(
        ConsultationId: consultationId,
        PrescriptionNumber: rxNumber,
        IssuedAt: DateTime.UtcNow,
        ClinicName: "St. Jude Primary Care Clinic",
        ClinicAddress: "124 Rizal Avenue, San Pedro, Laguna",
        ClinicContact: "Tel: (02) 8876-5432",
        DoctorName: "Dr. Elena Ramos",
        DoctorPrcLicense: "PRC-0098765",
        DoctorPtr: "PTR-2026-4411",
        DoctorS2License: "S2-112233-A",
        DoctorSpecialization: "Internal Medicine",
        PatientId: Guid.NewGuid(),
        PatientName: "Juan Dela Cruz",
        PatientAge: 36,
        PatientGender: "Male",
        PhilHealthNumber: null,
        PatientAllergies: null,
        ClinicalDiagnosis: isDangerousDrug ? "Severe Pain" : "Acute Pharyngitis",
        SpecialInstructions: null,
        Items:
        [
            new PrescriptionSlipItemDto(
                Guid.NewGuid(),
                isDangerousDrug ? "Morphine Sulfate" : "Amoxicillin",
                null,
                isDangerousDrug ? "10mg" : "500mg",
                "Tablet",
                "Take 1 tablet as directed",
                10,
                5,
                0,
                isDangerousDrug,
                null)
        ],
        PublicVerificationToken: "tok-sig-001",
        PublicVerificationUrl: "https://clinicez.ph/verify/rx/tok-sig-001",
        QrPayload: "https://clinicez.ph/verify/rx/tok-sig-001",
        DispenseStatus: "Pending",
        DispensedPharmacyName: null,
        DispensedPharmacistName: null,
        DispensedPharmacistPrc: null,
        DispensedReceiptNumber: null,
        DispensedReceiptUrl: null,
        DispensedAt: null,
        DispenseNotes: null,
        PharmacyStatus: null,
        PatientDateOfBirth: new DateOnly(1990, 5, 10),
        DoctorId: doctorId);

    private static LabOrderSlipDto CreateLabOrderSlip(
        Guid orderId,
        string orderNumber,
        Guid doctorId) => new(
        OrderId: orderId,
        OrderNumber: orderNumber,
        OrderDate: DateTime.UtcNow,
        ClinicName: "St. Jude Primary Care Clinic",
        ClinicAddress: "124 Rizal Avenue, San Pedro, Laguna",
        ClinicContact: "Tel: (02) 8876-5432",
        DoctorName: "Dr. Elena Ramos",
        DoctorPrcLicense: "PRC-0098765",
        DoctorPtr: "PTR-2026-4411",
        PatientId: Guid.NewGuid(),
        PatientName: "Juan Dela Cruz",
        PatientAge: 36,
        PatientGender: "Male",
        PhilHealthNumber: null,
        ClinicalDiagnosis: "Annual Checkup",
        FastingInstructions: "10 hours fasting",
        Items:
        [
            new LabOrderSlipItemDto("Complete Blood Count", "Hematology", "EDTA tube")
        ],
        PublicUploadUrl: "https://clinicez.ph/upload/lab-sig-001",
        QrPayload: "CLINICEZ:REQ:" + orderNumber,
        ClaimToken: null,
        PatientDateOfBirth: new DateOnly(1990, 5, 10),
        DoctorId: doctorId);

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
            if (streamLength > 0 && pdfBytes[streamStart + streamLength - 1] == '\n')
            {
                streamLength--;
                if (streamLength > 0 && pdfBytes[streamStart + streamLength - 1] == '\r') streamLength--;
            }
            else if (streamLength > 0 && pdfBytes[streamStart + streamLength - 1] == '\r')
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
                // Ignore binary image / non-zlib streams
            }

            pos = streamStart + endIdx + endStreamToken.Length;
        }

        var cmaps = new List<Dictionary<string, string>>();
        foreach (var stream in decompressedStreams)
        {
            if (!stream.Contains("begincmap")) continue;
            var cmap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            int bfCharIdx = 0;
            while ((bfCharIdx = stream.IndexOf("beginbfchar", bfCharIdx, StringComparison.Ordinal)) >= 0)
            {
                int endBfChar = stream.IndexOf("endbfchar", bfCharIdx, StringComparison.Ordinal);
                if (endBfChar < 0) break;
                var block = stream.Substring(bfCharIdx, endBfChar - bfCharIdx);
                foreach (Match m in Regex.Matches(block, @"<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>"))
                {
                    var dstHex = m.Groups[2].Value;
                    var dstSb = new StringBuilder();
                    for (int i = 0; i + 4 <= dstHex.Length; i += 4)
                    {
                        if (int.TryParse(dstHex.Substring(i, 4), System.Globalization.NumberStyles.HexNumber, null, out int codePoint))
                        {
                            dstSb.Append((char)codePoint);
                        }
                    }
                    cmap[m.Groups[1].Value] = dstSb.ToString();
                }
                bfCharIdx = endBfChar + 9;
            }

            int bfRangeIdx = 0;
            while ((bfRangeIdx = stream.IndexOf("beginbfrange", bfRangeIdx, StringComparison.Ordinal)) >= 0)
            {
                int endBfRange = stream.IndexOf("endbfrange", bfRangeIdx, StringComparison.Ordinal);
                if (endBfRange < 0) break;
                var block = stream.Substring(bfRangeIdx, endBfRange - bfRangeIdx);
                foreach (Match m in Regex.Matches(block, @"<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>"))
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

            if (cmap.Count > 0) cmaps.Add(cmap);
        }

        if (cmaps.Count > 0)
        {
            var decodedSb = new StringBuilder();
            foreach (var stream in decompressedStreams)
            {
                if (stream.Contains("begincmap")) continue;
                var hexMatches = Regex.Matches(stream, @"<([0-9A-Fa-f]{4,})>");
                foreach (var cmap in cmaps)
                {
                    foreach (Match m in hexMatches)
                    {
                        var hex = m.Groups[1].Value;
                        for (int i = 0; i + 4 <= hex.Length; i += 4)
                        {
                            if (cmap.TryGetValue(hex.Substring(i, 4), out var ch) && ch.Length > 0 && ch[0] != (char)0)
                            {
                                decodedSb.Append(ch);
                            }
                        }
                        decodedSb.Append(' ');
                    }
                    decodedSb.AppendLine();
                }

                foreach (Match m in Regex.Matches(stream, @"\(([^)]+)\)"))
                {
                    decodedSb.Append(m.Groups[1].Value).Append(' ');
                }
            }

            var decoded = decodedSb.ToString();
            var collapsed = Regex.Replace(decoded, @"(?<=[A-Za-z0-9]) (?=[A-Za-z0-9])", "");
            var normalized = Regex.Replace(collapsed, @"\s+", " ");
            sb.Append('\n').Append(decoded).Append('\n').Append(normalized);
        }

        return sb.ToString();
    }
}
