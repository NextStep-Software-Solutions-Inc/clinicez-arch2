using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents.Configuration;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicalDocumentsFooterAgeAndSignatoryTests
{
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();

    private static FacilitySettings CreateSettings(string? footer = null, string paperSize = "Letter") => new()
    {
        TenantId = "tenant-001",
        ClinicId = Guid.NewGuid(),
        ClinicName = "St. Jude Family Medical Clinic",
        LetterheadFooter = footer,
        PaperSize = paperSize
    };

    private static Patient CreatePatient(DateOnly dob, string gender = "Female", string name = "Maria Santos") => new()
    {
        Id = Guid.NewGuid(),
        TenantId = "tenant-001",
        ClinicId = Guid.NewGuid(),
        PatientCode = "PAT-2026-0001",
        ContactNumber = "+639171234567",
        FirstName = name.Split(' ')[0],
        LastName = name.Split(' ').Length > 1 ? name.Split(' ')[1] : "Patient",
        DateOfBirth = dob,
        Gender = Enum.TryParse<Gender>(gender, true, out var g) ? g : Gender.Female
    };

    private static MedicalCertificate CreateCert(string patientName = "Maria Santos", DateOnly? issueDate = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = "tenant-001",
        ClinicId = Guid.NewGuid(),
        CertificateNumber = "MC-2026-001",
        PatientId = Guid.NewGuid(),
        PatientName = patientName,
        DoctorId = Guid.NewGuid(),
        DoctorName = "Dr. Allan Ramos, MD",
        PrcLicenseNumber = "PRC-0056789",
        IssueDate = issueDate ?? new DateOnly(2026, 10, 20),
        Diagnosis = "Acute Bronchitis",
        Purpose = "Sick Leave",
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "Dr. Allan Ramos"
    };

    private static ReferralLetter CreateReferral(string patientName = "Juan Dela Cruz", DateOnly? refDate = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = "tenant-001",
        ClinicId = Guid.NewGuid(),
        ReferralNumber = "REF-2026-001",
        PatientId = Guid.NewGuid(),
        PatientName = patientName,
        ReferringDoctorId = Guid.NewGuid(),
        ReferringDoctorName = "Dr. Roberto Cruz, MD",
        ReferredToFacility = "Philippine Heart Center",
        ReferredDepartment = "Cardiology",
        ReferralDate = refDate ?? new DateOnly(2026, 10, 20),
        ProvisionalDiagnosis = "Hypertension Grade 2",
        ReasonForReferral = "2D Echocardiogram",
        ClinicalSummary = "Patient with elevated blood pressure and exertional fatigue.",
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "Dr. Roberto Cruz"
    };

    [Fact]
    public void Default_Statutory_Footer_Is_Universal_Across_All_Document_Types_When_Not_Configured()
    {
        var settings = CreateSettings(footer: null);

        // 1. Medical Certificate
        var cert = CreateCert();
        var medCertBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings);
        ExtractTextFromPdf(medCertBytes).Should().Contain("Valid Philippine Clinical Document");

        // 2. Prescription
        var slip = new PrescriptionSlipDto(
            ConsultationId: Guid.NewGuid(),
            PrescriptionNumber: "RX-2026-001",
            IssuedAt: new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc),
            ClinicName: settings.ClinicName,
            ClinicAddress: "124 Rizal Avenue",
            ClinicContact: "Tel: (02) 8876-5432",
            DoctorName: "Dr. Roberto Santos",
            DoctorPrcLicense: "0098451",
            DoctorPtr: "8472910",
            DoctorS2License: null,
            DoctorSpecialization: "Internal Medicine",
            PatientId: Guid.NewGuid(),
            PatientName: "Maria Santos",
            PatientAge: 28,
            PatientGender: "Female",
            PhilHealthNumber: null,
            PatientAllergies: null,
            ClinicalDiagnosis: "Acute Bronchitis",
            SpecialInstructions: "Take after meals",
            Items: new List<PrescriptionSlipItemDto>
            {
                new(Guid.NewGuid(), "Amoxicillin", null, "500mg", "capsule", "Take 1 cap TID", 21, 7, 0, false, null)
            },
            PublicVerificationToken: "tok-001",
            PublicVerificationUrl: "https://clinicez.ph/verify/rx/tok-001",
            QrPayload: "CLINICEZ:RX:RX-2026-001",
            DispenseStatus: "Pending",
            DispensedPharmacyName: null,
            DispensedPharmacistName: null,
            DispensedPharmacistPrc: null,
            DispensedReceiptNumber: null,
            DispensedReceiptUrl: null,
            DispensedAt: null,
            DispenseNotes: null,
            PatientDateOfBirth: new DateOnly(1998, 4, 12)
        );
        var rxBytes = _pdfService.GeneratePrescriptionPdf(slip, settings);
        ExtractTextFromPdf(rxBytes).Should().Contain("Valid Philippine Clinical Document");

        // 3. Lab Order Slip
        var labSlip = new LabOrderSlipDto(
            OrderId: Guid.NewGuid(),
            OrderNumber: "LAB-2026-001",
            OrderDate: new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc),
            ClinicName: settings.ClinicName,
            ClinicAddress: "124 Rizal Avenue",
            ClinicContact: "Tel: (02) 8876-5432",
            DoctorName: "Dr. Roberto Santos",
            DoctorPrcLicense: "0098451",
            DoctorPtr: "8472910",
            PatientId: Guid.NewGuid(),
            PatientName: "Pedro Penduko",
            PatientAge: 45,
            PatientGender: "Male",
            PhilHealthNumber: null,
            ClinicalDiagnosis: "Hypertension Evaluation",
            FastingInstructions: "10 hours fasting",
            Items: new List<LabOrderSlipItemDto>
            {
                new("Complete Blood Count", "Hematology", null)
            },
            PublicUploadUrl: "https://clinicez.ph/upload/lab-001",
            QrPayload: "CLINICEZ:REQ:LAB-2026-001",
            ClaimToken: null,
            PatientDateOfBirth: new DateOnly(1981, 8, 17)
        );
        var labBytes = _pdfService.GenerateLabRequisitionSlipPdf(labSlip, settings);
        ExtractTextFromPdf(labBytes).Should().Contain("Valid Philippine Clinical Document");

        // 4. Referral Letter
        var referral = CreateReferral();
        var refBytes = _pdfService.GenerateReferralLetterPdf(referral, settings);
        ExtractTextFromPdf(refBytes).Should().Contain("Valid Philippine Clinical Document");
    }

    [Fact]
    public void Long_Format_Patient_Age_Renders_Across_All_Document_Types()
    {
        var settings = CreateSettings();
        var patient = CreatePatient(new DateOnly(1998, 4, 12), "Female", "Maria Santos");

        // 1. Medical Certificate
        var cert = CreateCert("Maria Santos", new DateOnly(2026, 10, 20));
        var medCertBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, patient);
        var medCertText = ExtractTextFromPdf(medCertBytes);
        medCertText.Should().Contain("28 yrs");
        medCertText.Should().Contain("1 wk");
        medCertText.Should().Contain("1 day");

        // 2. Prescription
        var slip = new PrescriptionSlipDto(
            ConsultationId: Guid.NewGuid(),
            PrescriptionNumber: "RX-2026-001",
            IssuedAt: new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc),
            ClinicName: settings.ClinicName,
            ClinicAddress: "124 Rizal Avenue",
            ClinicContact: "Tel: (02) 8876-5432",
            DoctorName: "Dr. Roberto Santos",
            DoctorPrcLicense: "0098451",
            DoctorPtr: "8472910",
            DoctorS2License: null,
            DoctorSpecialization: "Internal Medicine",
            PatientId: patient.Id,
            PatientName: "Maria Santos",
            PatientAge: 28,
            PatientGender: "Female",
            PhilHealthNumber: null,
            PatientAllergies: null,
            ClinicalDiagnosis: "Acute Bronchitis",
            SpecialInstructions: null,
            Items: new List<PrescriptionSlipItemDto>
            {
                new(Guid.NewGuid(), "Amoxicillin", null, "500mg", "capsule", "TID", 21, 7, 0, false, null)
            },
            PublicVerificationToken: "tok-001",
            PublicVerificationUrl: "https://clinicez.ph/verify/rx/tok-001",
            QrPayload: "CLINICEZ:RX:RX-2026-001",
            DispenseStatus: "Pending",
            DispensedPharmacyName: null,
            DispensedPharmacistName: null,
            DispensedPharmacistPrc: null,
            DispensedReceiptNumber: null,
            DispensedReceiptUrl: null,
            DispensedAt: null,
            DispenseNotes: null,
            PatientDateOfBirth: new DateOnly(1998, 4, 12)
        );
        var rxBytes = _pdfService.GeneratePrescriptionPdf(slip, settings);
        var rxText = ExtractTextFromPdf(rxBytes);
        rxText.Should().Contain("28 yrs");
        rxText.Should().Contain("1 wk");
        rxText.Should().Contain("1 day");

        // 3. Lab Requisition Slip
        var labSlip = new LabOrderSlipDto(
            OrderId: Guid.NewGuid(),
            OrderNumber: "LAB-2026-001",
            OrderDate: new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc),
            ClinicName: settings.ClinicName,
            ClinicAddress: "124 Rizal Avenue",
            ClinicContact: "Tel: (02) 8876-5432",
            DoctorName: "Dr. Roberto Santos",
            DoctorPrcLicense: "0098451",
            DoctorPtr: "8472910",
            PatientId: Guid.NewGuid(),
            PatientName: "Pedro Penduko",
            PatientAge: 45,
            PatientGender: "Male",
            PhilHealthNumber: null,
            ClinicalDiagnosis: "Hypertension Evaluation",
            FastingInstructions: "10 hours fasting",
            Items: new List<LabOrderSlipItemDto>
            {
                new("Complete Blood Count", "Hematology", null)
            },
            PublicUploadUrl: "https://clinicez.ph/upload/lab-001",
            QrPayload: "CLINICEZ:REQ:LAB-2026-001",
            ClaimToken: null,
            PatientDateOfBirth: new DateOnly(1981, 8, 17)
        );
        var labBytes = _pdfService.GenerateLabRequisitionSlipPdf(labSlip, settings);
        var labText = ExtractTextFromPdf(labBytes);
        labText.Should().Contain("45 yrs");
        labText.Should().Contain("2 mos");
        labText.Should().Contain("3 days");

        // 4. Referral Letter
        var refPatient = CreatePatient(new DateOnly(1968, 5, 14), "Male", "Juan Dela Cruz");
        var referral = CreateReferral("Juan Dela Cruz", new DateOnly(2026, 10, 20));
        var refBytes = _pdfService.GenerateReferralLetterPdf(referral, settings, refPatient);
        var refText = ExtractTextFromPdf(refBytes);
        refText.Should().Contain("58 yrs");
        refText.Should().Contain("5 mos");
        refText.Should().Contain("6 days");
    }

    [Theory]
    [InlineData("Letter")]
    [InlineData("A4")]
    [InlineData("A5")]
    public void Doctor_Signatory_Anchors_Cleanly_Across_All_Paper_Sizes(string paperSize)
    {
        var settings = CreateSettings(paperSize: paperSize);
        var cert = CreateCert();

        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, signatureMode: SignatureMode.ESignatureSpecimen);
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(5000);

        var pdfText = ExtractTextFromPdf(pdfBytes);
        pdfText.Should().Contain("Allan Ramos");
        pdfText.Should().Contain("Digitally Certified & Locked");
    }

    [Fact]
    public void DocumentAccentColor_IsIndependent_FromWorkstationPrimaryColorHex()
    {
        // Document accent is Purple, while Workstation color branding is Teal
        var settings = CreateSettings();
        settings.PrimaryColorHex = "#0D6963"; // Workstation UI brand (Teal)
        settings.LetterheadAccentColorHex = "#7C3AED"; // Document stationery tone (Purple)

        var cert = CreateCert();
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings);

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(5000);
        settings.PrimaryColorHex.Should().Be("#0D6963", "Workstation color branding must remain untouched");
        settings.LetterheadAccentColorHex.Should().Be("#7C3AED");
    }

    [Fact]
    public void DocumentAccentColor_WhenNull_FallsBackToPrimaryColorHex()
    {
        var settings = CreateSettings();
        settings.PrimaryColorHex = "#0284C7";
        settings.LetterheadAccentColorHex = null;

        var cert = CreateCert();
        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings);

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(5000);
    }

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
            int rawLength = endIdx;
            int streamLength = rawLength;
            if (streamLength > 0 && pdfBytes[streamStart + streamLength - 1] == '\n')
            {
                streamLength--;
                if (streamLength > 0 && pdfBytes[streamStart + streamLength - 1] == '\r')
                {
                    streamLength--;
                }
            }
            else if (streamLength > 0 && pdfBytes[streamStart + streamLength - 1] == '\r')
            {
                streamLength--;
            }

            string? content = null;
            try
            {
                using var mem = new MemoryStream(pdfBytes, streamStart, streamLength);
                using var zlib = new ZLibStream(mem, CompressionMode.Decompress);
                using var reader = new StreamReader(zlib, Encoding.UTF8);
                content = reader.ReadToEnd();
            }
            catch
            {
                if (rawLength > 6 &&
                    (pdfBytes[streamStart] & 0x0F) == 8 &&
                    (pdfBytes[streamStart] >> 4) <= 7 &&
                    ((pdfBytes[streamStart] * 256 + pdfBytes[streamStart + 1]) % 31) == 0 &&
                    (pdfBytes[streamStart + 1] & 0x20) == 0)
                {
                    try
                    {
                        using var deflateMem = new MemoryStream(pdfBytes, streamStart + 2, rawLength - 2);
                        using var deflate = new DeflateStream(deflateMem, CompressionMode.Decompress);
                        using var reader = new StreamReader(deflate, Encoding.UTF8);
                        content = reader.ReadToEnd();
                    }
                    catch
                    {
                        // Non-Flate stream; ignore safely.
                    }
                }
            }

            if (content is not null)
            {
                sb.Append(content);
                decompressedStreams.Add(content);
            }

            pos = streamStart + endIdx + endStreamToken.Length;
        }

        // Parse ToUnicode CMaps per font subset so later subsets never overwrite earlier glyph IDs
        var cmaps = new List<Dictionary<string, string>>();
        foreach (var stream in decompressedStreams)
        {
            if (!stream.Contains("begincmap")) continue;
            var cmap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

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

            if (cmap.Count > 0)
            {
                cmaps.Add(cmap);
            }
        }

        // If we have CMap entries, decode hex strings in content streams across each font subset CMap
        if (cmaps.Count > 0)
        {
            var decodedSb = new StringBuilder();
            foreach (var stream in decompressedStreams)
            {
                if (stream.Contains("begincmap")) continue;

                // Match <00240033...>
                var hexMatches = System.Text.RegularExpressions.Regex.Matches(stream, @"<([0-9A-Fa-f]{4,})>");
                foreach (var cmap in cmaps)
                {
                    foreach (System.Text.RegularExpressions.Match m in hexMatches)
                    {
                        var hex = m.Groups[1].Value;
                        for (int i = 0; i + 4 <= hex.Length; i += 4)
                        {
                            var code = hex.Substring(i, 4);
                            if (cmap.TryGetValue(code, out var ch) && ch.Length > 0 && ch[0] != (char)0)
                            {
                                decodedSb.Append(ch);
                            }
                        }
                        decodedSb.Append(' ');
                    }
                    decodedSb.AppendLine();
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
