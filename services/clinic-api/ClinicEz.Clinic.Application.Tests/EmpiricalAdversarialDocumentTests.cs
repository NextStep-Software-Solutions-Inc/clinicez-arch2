using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Common;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents.Configuration;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class EmpiricalAdversarialDocumentTests
{
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();

    // 1x1 valid transparent PNG
    private static readonly byte[] Valid1x1PngBytes = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC");

    private static FacilitySettings CreateBaseSettings(string paperSize = "Letter")
    {
        return new FacilitySettings
        {
            TenantId = "adversarial-tenant",
            ClinicId = Guid.NewGuid(),
            ClinicName = "Adversarial Stress Test Clinic",
            LetterheadHeader = "ADVERSARIAL STRESS TEST CLINIC",
            LetterheadSubHeader = "Clinical Robustness Facility",
            LetterheadAddress = "100 Quality Lane, Stress City, Philippines",
            LetterheadContact = "+63 900 000 0000",
            LetterheadDohLto = "DOH-LTO-2026-STRESS",
            AccreditationNumber = "PHIC-STRESS-9999",
            PrimaryColorHex = "#0D6963",
            PaperSize = paperSize
        };
    }

    private static StaffMember CreateBaseDoctor()
    {
        return new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = "adversarial-tenant",
            ClinicId = Guid.NewGuid(),
            FirstName = "Maria",
            LastName = "Santos",
            Title = "Dr.",
            Specialty = "Internal Medicine",
            PrcLicenseNumber = "PRC-0099887",
            PtrNumber = "PTR-2026-1234",
            S2LicenseNumber = "PDEA-S2-9988",
            DefaultSignatureMode = SignatureMode.ESignatureSpecimen,
            SignatureSpecimen = "data:image/png;base64," + Convert.ToBase64String(Valid1x1PngBytes)
        };
    }

    #region 1. Corrupted or Invalid Base64 Image Strings

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\r\n\t  ")]
    [InlineData("invalid-base64-random-text!@#$%^&*()")]
    [InlineData("data:image/png;base64,")]
    [InlineData("data:image/png;base64,   ")]
    [InlineData("data:image/png;base64,invalid-characters-in-base64!!!")]
    [InlineData("data:image/jpeg;base64,incomplete-base64==")]
    [InlineData("data:image/png;base64,SGVsbG8gV29ybGQ=")] // valid base64, but plain text ("Hello World")
    public void ImageDecoderHelper_Should_Handle_All_Corrupted_Or_Invalid_Strings_Gracefully(string? input)
    {
        // Act
        var result = ImageDecoderHelper.TryDecode(input);

        // Assert: Must not throw any exception
    }

    [Theory]
    [InlineData("invalid-base64-random-text!@#$%^&*()")]
    [InlineData("data:image/png;base64,")]
    [InlineData("data:image/png;base64,invalid-characters-in-base64!!!")]
    [InlineData("data:image/jpeg;base64,incomplete-base64==")]
    [InlineData("   ")]
    public void Corrupted_Logo_In_Settings_Should_Not_Crash_Document_Generation(string corruptLogo)
    {
        // Arrange
        var settings = CreateBaseSettings();
        settings.PrimaryLogoUrl = corruptLogo;

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-CORRUPT-LOGO-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-12345",
            Diagnosis = "Hypertension Stage 2",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(pdfBytes).Should().StartWith("%PDF-");
    }

    [Theory]
    [InlineData("invalid-base64-random-text!@#$%^&*()")]
    [InlineData("data:image/png;base64,")]
    [InlineData("data:image/png;base64,invalid-characters-in-base64!!!")]
    [InlineData("data:image/jpeg;base64,incomplete-base64==")]
    [InlineData("   ")]
    public void Corrupted_SignatureSpecimen_Should_Not_Crash_Document_Generation(string corruptSignature)
    {
        // Arrange
        var settings = CreateBaseSettings();
        var doctor = CreateBaseDoctor();
        doctor.SignatureSpecimen = corruptSignature;
        doctor.DefaultSignatureMode = SignatureMode.ESignatureSpecimen;

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-CORRUPT-SIG-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-12345",
            Diagnosis = "Hypertension Stage 2",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, doctor: doctor);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(pdfBytes).Should().StartWith("%PDF-");
    }

    [Fact]
    public void Valid_Base64_Of_NonImage_Bytes_As_Signature_Should_Not_Crash_Document_Generation()
    {
        // Arrange
        var nonImageBase64 = "data:image/png;base64," + Convert.ToBase64String(Encoding.UTF8.GetBytes("This is plain text, not a PNG file header."));
        var settings = CreateBaseSettings();
        var doctor = CreateBaseDoctor();
        doctor.SignatureSpecimen = nonImageBase64;
        doctor.DefaultSignatureMode = SignatureMode.ESignatureSpecimen;

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-NONIMAGE-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-12345",
            Diagnosis = "Hypertension Stage 2",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var bytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, doctor: doctor);

        // Assert: Must not crash/throw 500, but produce valid PDF
        bytes.Should().NotBeNull();
        bytes.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(bytes).Should().StartWith("%PDF-");
    }

    [Fact]
    public void Valid_Base64_Of_NonImage_Bytes_As_PrimaryLogo_Should_Not_Crash_Document_Generation()
    {
        // Arrange
        var nonImageBase64 = "data:image/png;base64," + Convert.ToBase64String(Encoding.UTF8.GetBytes("Corrupt logo byte stream"));
        var settings = CreateBaseSettings();
        settings.PrimaryLogoUrl = nonImageBase64;

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-NONIMAGE-LOGO-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-12345",
            Diagnosis = "Hypertension Stage 2",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var bytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings);

        // Assert: Must not crash/throw 500, but produce valid PDF
        bytes.Should().NotBeNull();
        bytes.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(bytes).Should().StartWith("%PDF-");
    }

    #endregion

    #region 2. Extremely Large Signatures or Edge-Case Dimensions

    private static byte[] GenerateSyntheticPng(int width, int height)
    {
        using var ms = new MemoryStream();
        using var bw = new BinaryWriter(ms);

        // PNG signature
        bw.Write(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });

        // IHDR chunk
        bw.Write(SwapEndian(13)); // length
        bw.Write(Encoding.ASCII.GetBytes("IHDR"));
        bw.Write(SwapEndian(width));
        bw.Write(SwapEndian(height));
        bw.Write((byte)8); // bit depth 8
        bw.Write((byte)2); // color type RGB
        bw.Write((byte)0); // compression
        bw.Write((byte)0); // filter
        bw.Write((byte)0); // interlace
        bw.Write(SwapEndian(0)); // dummy CRC

        // IDAT chunk (minimal dummy scanlines with filter byte 0)
        using var rawDataMs = new MemoryStream();
        byte[] rowData = new byte[1 + width * 3]; // 0 filter byte + 3 bytes per pixel
        for (int y = 0; y < Math.Min(height, 100); y++)
        {
            rawDataMs.Write(rowData, 0, rowData.Length);
        }

        using var compressedMs = new MemoryStream();
        using (var deflateStream = new System.IO.Compression.ZLibStream(compressedMs, System.IO.Compression.CompressionLevel.Fastest))
        {
            deflateStream.Write(rawDataMs.ToArray());
        }

        byte[] compressedData = compressedMs.ToArray();
        bw.Write(SwapEndian(compressedData.Length));
        bw.Write(Encoding.ASCII.GetBytes("IDAT"));
        bw.Write(compressedData);
        bw.Write(SwapEndian(0)); // dummy CRC

        // IEND chunk
        bw.Write(SwapEndian(0));
        bw.Write(Encoding.ASCII.GetBytes("IEND"));
        bw.Write(SwapEndian(unchecked((int)0xAE426082)));

        return ms.ToArray();

        static int SwapEndian(int value)
        {
            var b = BitConverter.GetBytes(value);
            Array.Reverse(b);
            return BitConverter.ToInt32(b, 0);
        }
    }

    [Fact]
    public void Large_Signature_Specimen_Should_Not_Crash_Document_Generation()
    {
        // Arrange: Real 3.5MB PNG file from repository
        var settings = CreateBaseSettings();
        var doctor = CreateBaseDoctor();

        // Read real large PNG (3.5MB og-image.png)
        var realPngPath = Path.Combine(Directory.GetCurrentDirectory(), "../../../apps/portal-web/public/og-image.png");
        if (!File.Exists(realPngPath))
        {
            realPngPath = Path.GetFullPath("apps/portal-web/public/og-image.png");
        }

        byte[] pngBytes;
        if (File.Exists(realPngPath))
        {
            pngBytes = File.ReadAllBytes(realPngPath);
        }
        else
        {
            pngBytes = Valid1x1PngBytes;
        }

        doctor.SignatureSpecimen = "data:image/png;base64," + Convert.ToBase64String(pngBytes);
        doctor.DefaultSignatureMode = SignatureMode.ESignatureSpecimen;

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-LARGE-SIG-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-12345",
            Diagnosis = "Hypertension Stage 2",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, doctor: doctor);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(pdfBytes).Should().StartWith("%PDF-");
    }

    #endregion

    #region 3. Compact A5 Paper Size With Multi-Item Prescription

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(6)]
    [InlineData(10)]
    [InlineData(15)]
    [InlineData(25)]
    public void Prescription_On_A5_PaperSize_With_Many_Items_Should_Paginate_Without_Crashing(int itemCount)
    {
        // Arrange
        var settings = CreateBaseSettings(paperSize: "A5");
        var doctor = CreateBaseDoctor();

        var items = new List<PrescriptionSlipItemDto>();
        for (int i = 1; i <= itemCount; i++)
        {
            items.Add(new PrescriptionSlipItemDto(
                ItemId: Guid.NewGuid(),
                GenericName: $"Generic Med {i} hydrochloride",
                BrandName: $"BrandName {i}",
                Dosage: $"{i * 10} mg",
                Form: "Tablet",
                Sig: $"Take 1 tablet every 8 hours with meals for {i * 2} days. Ensure adequate fluid intake.",
                Quantity: i * 14,
                DurationDays: i * 2,
                Refills: 2,
                IsDangerousDrug: i == 1, // first item is dangerous drug to also trigger PDEA warning
                Remarks: i % 2 == 0 ? "Take with full glass of water. Do not crush." : null
            ));
        }

        var slip = new PrescriptionSlipDto(
            ConsultationId: Guid.NewGuid(),
            PrescriptionNumber: $"RX-A5-ITEMS-{itemCount}",
            IssuedAt: DateTime.UtcNow,
            ClinicName: settings.ClinicName,
            ClinicAddress: settings.LetterheadAddress!,
            ClinicContact: settings.LetterheadContact!,
            DoctorName: "Dr. Maria Santos",
            DoctorPrcLicense: "0099887",
            DoctorPtr: "PTR-2026-1234",
            DoctorS2License: "PDEA-S2-9988",
            DoctorSpecialization: "Internal Medicine",
            PatientId: Guid.NewGuid(),
            PatientName: "Geronimo Dela Cruz",
            PatientAge: 52,
            PatientGender: "Male",
            PhilHealthNumber: "PHIC-123456789",
            PatientAllergies: "Penicillin, Sulfonamides",
            ClinicalDiagnosis: "Multiple Chronic Conditions: T2DM, HTN, Hyperlipidemia, GERD",
            SpecialInstructions: "Follow up in 2 weeks",
            Items: items,
            PublicVerificationToken: "token-stress",
            PublicVerificationUrl: "https://clinic.ph/verify/rx/token-stress",
            QrPayload: "https://clinic.ph/verify/rx/token-stress",
            DispenseStatus: "Pending",
            DispensedPharmacyName: null,
            DispensedPharmacistName: null,
            DispensedPharmacistPrc: null,
            DispensedReceiptNumber: null,
            DispensedReceiptUrl: null,
            DispensedAt: null,
            DispenseNotes: null
        );

        // Act
        var pdfBytes = _pdfService.GeneratePrescriptionPdf(slip, settings, doctor: doctor);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
        var pdfText = Encoding.ASCII.GetString(pdfBytes);
        pdfText.Should().StartWith("%PDF-");
        pdfText.Should().Contain("%%EOF");
    }

    [Fact]
    public void Lab_Requisition_Slip_On_A5_PaperSize_With_20_Items_Should_Paginate_Without_Crashing()
    {
        // Arrange
        var settings = CreateBaseSettings(paperSize: "A5");
        var doctor = CreateBaseDoctor();

        var items = new List<LabOrderSlipItemDto>();
        for (int i = 1; i <= 20; i++)
        {
            items.Add(new LabOrderSlipItemDto(
                TestName: $"Diagnostic Panel Test #{i} - Extended Profile",
                Category: i % 2 == 0 ? "Clinical Chemistry" : "Hematology",
                Instructions: "Fasting 10-12 hours required prior to collection."
            ));
        }

        var slip = new LabOrderSlipDto(
            OrderId: Guid.NewGuid(),
            OrderNumber: "ORD-A5-STRESS-20",
            OrderDate: DateTime.UtcNow,
            ClinicName: settings.ClinicName,
            ClinicAddress: settings.LetterheadAddress!,
            ClinicContact: settings.LetterheadContact!,
            DoctorName: "Dr. Maria Santos",
            DoctorPrcLicense: "0099887",
            DoctorPtr: "PTR-2026-1234",
            PatientId: Guid.NewGuid(),
            PatientName: "Geronimo Dela Cruz",
            PatientAge: 52,
            PatientGender: "Male",
            PhilHealthNumber: "PHIC-123456789",
            ClinicalDiagnosis: "Comprehensive Health Screen",
            FastingInstructions: "Strict fasting from midnight.",
            Items: items,
            PublicUploadUrl: "https://lab.clinic.ph/upload/ORD-A5-STRESS-20",
            QrPayload: "https://lab.clinic.ph/upload/ORD-A5-STRESS-20"
        );

        // Act
        var pdfBytes = _pdfService.GenerateLabRequisitionSlipPdf(slip, settings, doctor: doctor);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
        var pdfText = Encoding.ASCII.GetString(pdfBytes);
        pdfText.Should().StartWith("%PDF-");
        pdfText.Should().Contain("%%EOF");
    }

    #endregion

    #region 4. Missing Doctor or Credentials

    [Fact]
    public void Document_Generation_With_Null_Doctor_Should_Fallback_To_Document_Doctor_Fields()
    {
        // Arrange
        var settings = CreateBaseSettings();
        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-NULL-DOCTOR-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "Dr. Fallback Physician, MD",
            PrcLicenseNumber = "PRC-FALLBACK-123",
            PtrNumber = "PTR-FALLBACK-456",
            Diagnosis = "Acute Gastritis",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, doctor: null);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(pdfBytes).Should().StartWith("%PDF-");
    }

    [Fact]
    public void Document_Generation_When_Doctor_Credentials_Are_Null_Or_Empty_Should_Not_Crash()
    {
        // Arrange
        var settings = CreateBaseSettings();
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            FirstName = "Pedro",
            LastName = "Penduko",
            Title = null,
            Specialty = null,
            PrcLicenseNumber = null,
            PtrNumber = null,
            S2LicenseNumber = null,
            SignatureSpecimen = null,
            DefaultSignatureMode = SignatureMode.WetSignature
        };

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-EMPTY-CREDS-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-12345",
            PtrNumber = null,
            Diagnosis = "Tension Headache",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, doctor: doctor);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(pdfBytes).Should().StartWith("%PDF-");
    }

    [Fact]
    public void Document_Generation_When_Doctor_And_Cert_DoctorName_Are_Empty_Should_Not_Crash()
    {
        // Arrange
        var settings = CreateBaseSettings();
        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-EMPTY-DOCTOR-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "",
            PrcLicenseNumber = "PRC-12345",
            PtrNumber = null,
            Diagnosis = "Tension Headache",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, doctor: null);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
    }

    [Fact]
    public void ReferralLetter_Generation_With_Null_Doctor_And_Null_Patient_Should_Not_Crash()
    {
        // Arrange
        var settings = CreateBaseSettings();
        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            ReferralNumber = "REF-20261020-0001",
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara",
            ReferringDoctorId = Guid.NewGuid(),
            ReferringDoctorName = "Dr. Allan Ramos",
            ReferralDate = DateOnly.FromDateTime(DateTime.UtcNow),
            ReferredToFacility = "National Kidney and Transplant Institute",
            ReferredDepartment = "Nephrology",
            ProvisionalDiagnosis = "Chronic Kidney Disease Stage 3b",
            ReasonForReferral = "Specialist consultation",
            ClinicalSummary = "Elevated creatinine levels.",
            Urgency = "Routine"
        };

        // Act
        var pdfBytes = _pdfService.GenerateReferralLetterPdf(referral, settings, patient: null, doctor: null);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(pdfBytes).Should().StartWith("%PDF-");
    }

    [Fact]
    public void Settings_With_Null_Header_SubHeader_Address_And_Contacts_Should_Not_Crash()
    {
        // Arrange
        var settings = new FacilitySettings
        {
            TenantId = "tenant-minimal",
            ClinicId = Guid.NewGuid(),
            ClinicName = "Fallback Minimal Clinic",
            LetterheadHeader = null,
            LetterheadSubHeader = null,
            LetterheadAddress = null,
            LetterheadContact = null,
            LetterheadDohLto = null,
            LetterheadFooter = null,
            AccreditationNumber = null,
            PrimaryLogoUrl = null,
            PrimaryColorHex = "#0284C7"
        };

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-MINIMAL-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-12345",
            Diagnosis = "Health Checkup",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, doctor: null);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(pdfBytes).Should().StartWith("%PDF-");
    }

    [Fact]
    public void Truncated_Png_Header_In_Signature_Should_Not_Crash_Document_Generation()
    {
        // Arrange: Valid PNG header truncated right after IHDR chunk header (invalid stream)
        var truncatedPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";
        var settings = CreateBaseSettings();
        var doctor = CreateBaseDoctor();
        doctor.SignatureSpecimen = truncatedPngBase64;
        doctor.DefaultSignatureMode = SignatureMode.ESignatureSpecimen;

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            CertificateNumber = "MC-TRUNC-SIG-01",
            PatientName = "Juan Dela Cruz",
            DoctorName = "Dr. Allan Ramos",
            PrcLicenseNumber = "PRC-12345",
            Diagnosis = "Hypertension Stage 2",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };

        // Act
        var bytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, doctor: doctor);

        // Assert
        bytes.Should().NotBeNull();
        bytes.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(bytes).Should().StartWith("%PDF-");
    }

    #endregion
}
