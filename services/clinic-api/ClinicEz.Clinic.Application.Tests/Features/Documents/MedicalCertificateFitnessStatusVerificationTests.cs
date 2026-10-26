using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Documents.Commands;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
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

namespace ClinicEz.Clinic.Application.Tests.Features.Documents;

public class MedicalCertificateFitnessStatusVerificationTests
{
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();

    // =========================================================================
    // 1. MedicalCertificate.FormatFitnessStatus UNIT TESTS
    // =========================================================================

    [Theory]
    [InlineData("FitToWork", "FIT TO WORK")]
    [InlineData("UnfitToWork", "UNFIT TO WORK")]
    [InlineData("FitToSchool", "FIT TO SCHOOL")]
    [InlineData("LightDuty", "LIGHT DUTY")]
    [InlineData("FitWithRestrictions", "FIT WITH RESTRICTIONS")]
    [InlineData("FitForWork", "FIT FOR WORK")]
    [InlineData("UnfitForWork", "UNFIT FOR WORK")]
    public void FormatFitnessStatus_CanonicalPascalCase_ShouldMapToSpacedUppercase(string input, string expected)
    {
        MedicalCertificate.FormatFitnessStatus(input).Should().Be(expected);
    }

    [Theory]
    [InlineData("Fit to work", "FIT TO WORK")]
    [InlineData("FIT TO WORK", "FIT TO WORK")]
    [InlineData("fit to work", "FIT TO WORK")]
    [InlineData("unfit to work", "UNFIT TO WORK")]
    [InlineData("UNFIT TO WORK", "UNFIT TO WORK")]
    [InlineData("fit to school", "FIT TO SCHOOL")]
    [InlineData("light duty", "LIGHT DUTY")]
    [InlineData("fit with restrictions", "FIT WITH RESTRICTIONS")]
    [InlineData("  Fit   To   Work  ", "FIT TO WORK")]
    public void FormatFitnessStatus_AlreadySpacedAndCaseVariations_ShouldMapToCleanSpacedUppercase(string input, string expected)
    {
        MedicalCertificate.FormatFitnessStatus(input).Should().Be(expected);
    }

    [Theory]
    [InlineData("FITTOWORK", "FIT TO WORK")]
    [InlineData("UNFITTOWORK", "UNFIT TO WORK")]
    [InlineData("FITTOSCHOOL", "FIT TO SCHOOL")]
    [InlineData("LIGHTDUTY", "LIGHT DUTY")]
    [InlineData("FITWITHRESTRICTIONS", "FIT WITH RESTRICTIONS")]
    [InlineData("FITFORWORK", "FIT FOR WORK")]
    [InlineData("UNFITFORWORK", "UNFIT FOR WORK")]
    public void FormatFitnessStatus_UnspacedUppercase_ShouldMapToSpacedUppercase(string input, string expected)
    {
        MedicalCertificate.FormatFitnessStatus(input).Should().Be(expected);
    }

    [Theory]
    [InlineData("fit_to_work", "FIT TO WORK")]
    [InlineData("unfit_to_work", "UNFIT TO WORK")]
    [InlineData("fit-to-school", "FIT TO SCHOOL")]
    [InlineData("light-duty", "LIGHT DUTY")]
    [InlineData("fit_with_restrictions", "FIT WITH RESTRICTIONS")]
    [InlineData("__FIT__TO__WORK__", "FIT TO WORK")]
    [InlineData("light--duty", "LIGHT DUTY")]
    public void FormatFitnessStatus_Delimited_SnakeCaseAndKebabCase_ShouldMapToSpacedUppercase(string input, string expected)
    {
        MedicalCertificate.FormatFitnessStatus(input).Should().Be(expected);
    }

    [Theory]
    [InlineData("FitForTravel", "FIT FOR TRAVEL")]
    [InlineData("TemporaryUnfit", "TEMPORARY UNFIT")]
    [InlineData("PendingLabResults", "PENDING LAB RESULTS")]
    [InlineData("QuarantineRequired", "QUARANTINE REQUIRED")]
    [InlineData("COVID19Cleared", "COVID19 CLEARED")]
    public void FormatFitnessStatus_ArbitraryPascalCaseAndAcronyms_ShouldSplitAndUppercase(string input, string expected)
    {
        MedicalCertificate.FormatFitnessStatus(input).Should().Be(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\r\n  ")]
    public void FormatFitnessStatus_NullEmptyWhitespace_ShouldReturnEmptyStringWithoutThrowing(string? input)
    {
        var act = () => MedicalCertificate.FormatFitnessStatus(input);
        act.Should().NotThrow();
        MedicalCertificate.FormatFitnessStatus(input).Should().Be(string.Empty);
    }

    // =========================================================================
    // 2. OMC PDF GENERATION & PER-FONT /ToUnicode CMap VERIFICATION
    // =========================================================================

    [Theory]
    [InlineData("FitToWork", "FIT TO WORK", "FITTOWORK")]
    [InlineData("UnfitToWork", "UNFIT TO WORK", "UNFITTOWORK")]
    [InlineData("FitToSchool", "FIT TO SCHOOL", "FITTOSCHOOL")]
    [InlineData("LightDuty", "LIGHT DUTY", "LIGHTDUTY")]
    [InlineData("FitWithRestrictions", "FIT WITH RESTRICTIONS", "FITWITHRESTRICTIONS")]
    public void GenerateMedicalCertificatePdf_ShouldRenderSpacedFitnessStatus_AcrossAllStandardStatuses(
        string storedStatus, string expectedFormatted, string unspacedAntiPattern)
    {
        var settings = CreateSettings();
        var cert = CreateCert(storedStatus);

        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings);

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);

        var cleanPdfText = ExtractExactPdfText(pdfBytes);

        // Verify human-readable spaced status is present
        cleanPdfText.Should().Contain($"Fitness Status: {expectedFormatted}");

        // Verify unspaced uppercase anti-pattern does NOT occur anywhere in decoded page text
        cleanPdfText.Should().NotContain(unspacedAntiPattern);
    }

    [Theory]
    [InlineData(SignatureMode.ESignatureSpecimen)]
    [InlineData(SignatureMode.WetSignature)]
    public void GenerateMedicalCertificatePdf_BothSignatureModes_ShouldRenderSpacedFitnessStatus(SignatureMode mode)
    {
        var settings = CreateSettings();
        var cert = CreateCert("FitToWork");
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            FirstName = "Allan",
            LastName = "Ramos",
            Role = StaffRole.Doctor,
            Title = "Dr.",
            Specialty = "General Practice",
            PrcLicenseNumber = "PRC-0056789",
            DefaultSignatureMode = mode
        };

        var pdfBytes = _pdfService.GenerateMedicalCertificatePdf(cert, settings, doctor: doctor, signatureMode: mode);
        var cleanPdfText = ExtractExactPdfText(pdfBytes);

        cleanPdfText.Should().Contain("Fitness Status: FIT TO WORK");
        cleanPdfText.Should().NotContain("FITTOWORK");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void GenerateMedicalCertificatePdf_NullEmptyWhitespace_ShouldProduceValidPdfWithoutThrowing(string? status)
    {
        var settings = CreateSettings();
        var cert = CreateCert(status!);

        var act = () => _pdfService.GenerateMedicalCertificatePdf(cert, settings);
        act.Should().NotThrow();

        var pdfBytes = act();
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(100);

        var header = Encoding.ASCII.GetString(pdfBytes, 0, 5);
        header.Should().Be("%PDF-");
    }

    // =========================================================================
    // 3. DocumentsController VERTICAL END-TO-END FLOW TESTS
    // =========================================================================

    [Theory]
    [InlineData("FitToWork", "FIT TO WORK", "FITTOWORK")]
    [InlineData("UnfitToWork", "UNFIT TO WORK", "UNFITTOWORK")]
    [InlineData("FitToSchool", "FIT TO SCHOOL", "FITTOSCHOOL")]
    [InlineData("LightDuty", "LIGHT DUTY", "LIGHTDUTY")]
    [InlineData("FitWithRestrictions", "FIT WITH RESTRICTIONS", "FITWITHRESTRICTIONS")]
    public async Task EndToEnd_IssueCommand_And_DownloadPdf_ShouldPreserveWireCodeAndFormatOutputs(
        string selectedFitnessCode, string expectedDisplay, string unspacedAntiPattern)
    {
        var clinicId = Guid.NewGuid();
        const string tenantId = "tenant-001";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        var settings = CreateSettings();
        settings.ClinicId = clinicId;
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = Phase3TestKit.MedCert(medCertRepo, uow, clinicContext, db);

        // 1. Issue certificate via command (matching Consultations dialog Lock & Issue flow)
        var dto = await handler.Handle(new IssueMedicalCertificateCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Maria Clara De Los Santos",
            ConsultationId: Guid.NewGuid(),
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Allan Ramos, MD",
            PrcLicenseNumber: "PRC-0056789",
            PtrNumber: "PTR-2026-9912",
            Diagnosis: "Acute Bronchitis",
            ClinicalFindings: "Mild non-productive cough",
            FitnessStatus: selectedFitnessCode,
            RecommendedRestDays: 2,
            Purpose: "Employment",
            Remarks: "Hydration advised"), CancellationToken.None);

        // Wire DTO & DB entity retain canonical PascalCase code (zero breaking changes)
        dto.FitnessStatus.Should().Be(selectedFitnessCode);
        var persisted = await medCertRepo.GetByIdAsync(dto.Id, CancellationToken.None);
        persisted.Should().NotBeNull();
        persisted!.FitnessStatus.Should().Be(selectedFitnessCode);

        var controller = new DocumentsController(
            Substitute.For<ISender>(), _pdfService, medCertRepo, referralRepo, staffRepo,
            settingsRepo, patientRepo, uow);

        // 2. Download generated OMC PDF via controller endpoint
        var downloadAction = await controller.DownloadMedicalCertificatePdf(dto.Id, wet: null, CancellationToken.None);
        downloadAction.Should().BeOfType<FileContentResult>();
        var fileContent = (FileContentResult)downloadAction;

        var pdfText = ExtractExactPdfText(fileContent.FileContents);
        pdfText.Should().Contain($"Fitness Status: {expectedDisplay}");
        pdfText.Should().NotContain(unspacedAntiPattern);
    }

    // =========================================================================
    // HELPERS & ISO 32000-1 PER-FONT /ToUnicode CMap PDF TEXT EXTRACTOR
    // =========================================================================

    private static ClinicSettings CreateSettings() => new()
    {
        TenantId = "tenant-001",
        ClinicId = Guid.NewGuid(),
        ClinicName = "St. Jude Family Medical Clinic",
        LetterheadHeader = "ST. JUDE FAMILY MEDICAL CLINIC",
        PrimaryColorHex = "#0284C7",
        PaperSize = "Letter"
    };

    private static MedicalCertificate CreateCert(string fitnessStatus) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = "tenant-001",
        ClinicId = Guid.NewGuid(),
        CertificateNumber = "MC-20261024-0001",
        PatientId = Guid.NewGuid(),
        PatientName = "Maria Clara De Los Santos",
        DoctorId = Guid.NewGuid(),
        DoctorName = "Dr. Allan Ramos, MD",
        PrcLicenseNumber = "PRC-0056789",
        Diagnosis = "Acute Bronchitis",
        FitnessStatus = fitnessStatus,
        RecommendedRestDays = 3,
        IssueDate = new DateOnly(2026, 10, 24),
        IsSigned = true,
        SignedAt = DateTime.UtcNow
    };

    /// <summary>
    /// Resolves PDF indirect objects, per-font /ToUnicode CMap streams (/Font &lt;&lt; /F* N 0 R &gt;&gt; -&gt; /ToUnicode M 0 R),
    /// and decodes content streams sequentially across Tf, Tj, and TJ operators with exact U+0020 space preservation.
    /// </summary>
    public static string ExtractExactPdfText(byte[] pdfBytes)
    {
        var rawLatin1 = Encoding.Latin1.GetString(pdfBytes);
        var objectHeaders = new Dictionary<int, string>();
        var objectStreams = new Dictionary<int, string>();

        foreach (Match objMatch in Regex.Matches(rawLatin1, @"(\d+)\s+0\s+obj\b(.*?)endobj", RegexOptions.Singleline))
        {
            if (!int.TryParse(objMatch.Groups[1].Value, out int objId)) continue;
            var body = objMatch.Groups[2].Value;
            int streamPos = body.IndexOf("stream", StringComparison.Ordinal);
            if (streamPos >= 0)
            {
                objectHeaders[objId] = body.Substring(0, streamPos);
                int dataStart = objMatch.Groups[2].Index + streamPos + "stream".Length;
                if (dataStart < pdfBytes.Length && pdfBytes[dataStart] == '\r') dataStart++;
                if (dataStart < pdfBytes.Length && pdfBytes[dataStart] == '\n') dataStart++;

                int endStreamInBody = body.LastIndexOf("endstream", StringComparison.Ordinal);
                if (endStreamInBody > streamPos)
                {
                    int rawEnd = objMatch.Groups[2].Index + endStreamInBody;
                    int rawLen = rawEnd - dataStart;
                    int dataEnd = rawEnd;
                    if (dataEnd > dataStart && pdfBytes[dataEnd - 1] == '\n')
                    {
                        dataEnd--;
                        if (dataEnd > dataStart && pdfBytes[dataEnd - 1] == '\r')
                            dataEnd--;
                    }
                    else if (dataEnd > dataStart && pdfBytes[dataEnd - 1] == '\r')
                    {
                        dataEnd--;
                    }

                    int len = dataEnd - dataStart;
                    if (len > 0)
                    {
                        try
                        {
                            using var mem = new MemoryStream(pdfBytes, dataStart, len);
                            using var zlib = new ZLibStream(mem, CompressionMode.Decompress);
                            using var reader = new StreamReader(zlib, Encoding.UTF8);
                            objectStreams[objId] = reader.ReadToEnd();
                        }
                        catch
                        {
                            if (rawLen > 6 &&
                                (pdfBytes[dataStart] & 0x0F) == 8 &&
                                (pdfBytes[dataStart] >> 4) <= 7 &&
                                ((pdfBytes[dataStart] * 256 + pdfBytes[dataStart + 1]) % 31) == 0 &&
                                (pdfBytes[dataStart + 1] & 0x20) == 0)
                            {
                                try
                                {
                                    using var deflateMem = new MemoryStream(pdfBytes, dataStart + 2, rawLen - 2);
                                    using var deflate = new DeflateStream(deflateMem, CompressionMode.Decompress);
                                    using var reader = new StreamReader(deflate, Encoding.UTF8);
                                    objectStreams[objId] = reader.ReadToEnd();
                                }
                                catch
                                {
                                    // Non-Flate stream (e.g. raw image data); safely ignore.
                                }
                            }
                        }
                    }
                }
            }
            else
            {
                objectHeaders[objId] = body;
            }
        }

        // Map each font object ID -> parsed /ToUnicode CMap dictionary
        var fontObjCmaps = new Dictionary<int, Dictionary<string, string>>();
        var fallbackCmap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (objId, header) in objectHeaders)
        {
            var toUnicodeMatch = Regex.Match(header, @"/ToUnicode\s+(\d+)\s+0\s+R");
            if (toUnicodeMatch.Success &&
                int.TryParse(toUnicodeMatch.Groups[1].Value, out int cmapObjId) &&
                objectStreams.TryGetValue(cmapObjId, out var cmapStream) &&
                cmapStream.Contains("begincmap", StringComparison.Ordinal))
            {
                var parsed = ParseToUnicodeCmap(cmapStream);
                fontObjCmaps[objId] = parsed;
                foreach (var kv in parsed)
                    fallbackCmap[kv.Key] = kv.Value;
            }
        }

        foreach (var (_, st) in objectStreams)
        {
            if (st.Contains("begincmap", StringComparison.Ordinal))
            {
                foreach (var kv in ParseToUnicodeCmap(st))
                    fallbackCmap.TryAdd(kv.Key, kv.Value);
            }
        }

        // Map font resource names (e.g., "F0", "F1") -> per-font CMap
        var fontResourceCmaps = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
        foreach (var (_, header) in objectHeaders)
        {
            foreach (Match fontEntry in Regex.Matches(header, @"/(F[A-Za-z0-9_]+)\s+(\d+)\s+0\s+R"))
            {
                var fontKey = fontEntry.Groups[1].Value;
                if (int.TryParse(fontEntry.Groups[2].Value, out int fontObjId) &&
                    fontObjCmaps.TryGetValue(fontObjId, out var cmap))
                {
                    fontResourceCmaps[fontKey] = cmap;
                }
            }
        }

        // Decode content streams sequentially across Tf, Tj, and TJ operators
        var sb = new StringBuilder();
        var tokenRegex = new Regex(
            @"/(F[A-Za-z0-9_]+)\s+[-+]?\d*\.?\d+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj|\[(.*?)\]\s*TJ",
            RegexOptions.Singleline);

        foreach (var (_, st) in objectStreams)
        {
            if (st.Contains("begincmap", StringComparison.Ordinal) || !st.Contains("BT", StringComparison.Ordinal))
                continue;

            Dictionary<string, string> activeCmap = fallbackCmap;
            foreach (Match token in tokenRegex.Matches(st))
            {
                if (token.Groups[1].Success)
                {
                    if (fontResourceCmaps.TryGetValue(token.Groups[1].Value, out var specificCmap))
                        activeCmap = specificCmap;
                }
                else if (token.Groups[2].Success)
                {
                    AppendHexGlyphs(sb, token.Groups[2].Value, activeCmap, fallbackCmap);
                }
                else if (token.Groups[3].Success)
                {
                    foreach (Match elem in Regex.Matches(token.Groups[3].Value, @"<([0-9A-Fa-f]+)>"))
                    {
                        AppendHexGlyphs(sb, elem.Groups[1].Value, activeCmap, fallbackCmap);
                    }
                }
            }
        }

        return sb.ToString();
    }

    private static void AppendHexGlyphs(
        StringBuilder sb,
        string hex,
        Dictionary<string, string> activeCmap,
        Dictionary<string, string> fallbackCmap)
    {
        for (int i = 0; i + 4 <= hex.Length; i += 4)
        {
            var code = hex.Substring(i, 4);
            if (activeCmap.TryGetValue(code, out var ch) || fallbackCmap.TryGetValue(code, out ch))
            {
                sb.Append(ch);
            }
        }
    }

    private static Dictionary<string, string> ParseToUnicodeCmap(string cmapStream)
    {
        var cmap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        int idx = 0;
        while ((idx = cmapStream.IndexOf("beginbfchar", idx, StringComparison.Ordinal)) >= 0)
        {
            int end = cmapStream.IndexOf("endbfchar", idx, StringComparison.Ordinal);
            if (end < 0) break;
            var block = cmapStream.Substring(idx, end - idx);
            foreach (Match m in Regex.Matches(block, @"<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>"))
            {
                var src = m.Groups[1].Value;
                var dstHex = m.Groups[2].Value;
                var dstSb = new StringBuilder();
                for (int i = 0; i + 4 <= dstHex.Length; i += 4)
                {
                    if (int.TryParse(dstHex.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int cp) && cp != 0)
                        dstSb.Append((char)cp);
                }
                if (dstSb.Length > 0)
                    cmap[src] = dstSb.ToString();
            }
            idx = end + 9;
        }

        idx = 0;
        while ((idx = cmapStream.IndexOf("beginbfrange", idx, StringComparison.Ordinal)) >= 0)
        {
            int end = cmapStream.IndexOf("endbfrange", idx, StringComparison.Ordinal);
            if (end < 0) break;
            var block = cmapStream.Substring(idx, end - idx);
            foreach (Match m in Regex.Matches(block, @"<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>"))
            {
                if (int.TryParse(m.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int sSrc) &&
                    int.TryParse(m.Groups[2].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int eSrc) &&
                    int.TryParse(m.Groups[3].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int sDst))
                {
                    for (int s = sSrc, d = sDst; s <= eSrc; s++, d++)
                    {
                        if (d != 0)
                            cmap[s.ToString("X4")] = ((char)d).ToString();
                    }
                }
            }
            idx = end + 10;
        }

        return cmap;
    }
}
