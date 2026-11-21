using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Attachments.Commands;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Security;
using ClinicEz.Comms.Infrastructure.Storage;
using ClinicEz.Comms.Tests.Support;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class AttachmentSecurityPipelineTests
{
    [Fact]
    public async Task JpegExifStripper_RemovesApp1Exif_AndPreservesImageStream()
    {
        // Build synthetic JPEG with SOI, APP1 (EXIF), and SOS/EOI
        using var ms = new MemoryStream();
        // SOI
        ms.Write([0xFF, 0xD8]);

        // APP1 (EXIF): 0xFF 0xE1, 2-byte big-endian length = 10, payload = 8 bytes
        ms.Write([0xFF, 0xE1, 0x00, 0x0A]);
        ms.Write(Encoding.ASCII.GetBytes("Exif\0\0\x01\x02"));

        // DQT: 0xFF 0xDB, length = 6, payload = 4 bytes
        ms.Write([0xFF, 0xDB, 0x00, 0x06, 0x01, 0x02, 0x03, 0x04]);

        // SOS: 0xFF 0xDA
        ms.Write([0xFF, 0xDA]);
        // Image entropy bytes
        ms.Write([0x12, 0x34, 0x56, 0x78]);
        // EOI: 0xFF 0xD9
        ms.Write([0xFF, 0xD9]);

        ms.Position = 0;

        var (stripped, sanitizedBytes) = await JpegExifStripper.StripExifAsync(ms);

        Assert.True(stripped);
        Assert.NotNull(sanitizedBytes);

        // Verify SOI is present
        Assert.Equal(0xFF, sanitizedBytes[0]);
        Assert.Equal(0xD8, sanitizedBytes[1]);

        // Verify APP1 marker 0xFF 0xE1 is NOT in sanitized output
        var rawString = Encoding.Latin1.GetString(sanitizedBytes);
        Assert.DoesNotContain("\xFF\xE1", rawString);

        // Verify DQT 0xFF 0xDB and SOS 0xFF 0xDA are present
        Assert.Contains("\xFF\xDB", rawString);
        Assert.Contains("\xFF\xDA", rawString);
    }

    [Fact]
    public async Task PngExifStripper_RemovesTextAndExifChunks_AndPreservesIhdrAndIdat()
    {
        // Build synthetic PNG
        using var ms = new MemoryStream();
        // Signature (8 bytes)
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        // IHDR chunk: 13 bytes data + 4 bytes type + 4 bytes length + 4 bytes CRC
        WritePngChunk(ms, "IHDR", new byte[13]);

        // tEXt chunk: metadata to strip
        WritePngChunk(ms, "tEXt", Encoding.ASCII.GetBytes("Author=Dr. Santos"));

        // IDAT chunk: image data
        WritePngChunk(ms, "IDAT", [0x01, 0x02, 0x03, 0x04]);

        // IEND chunk
        WritePngChunk(ms, "IEND", []);

        ms.Position = 0;

        var (stripped, sanitizedBytes) = await PngExifStripper.StripMetadataAsync(ms);

        Assert.True(stripped);
        var rawText = Encoding.ASCII.GetString(sanitizedBytes);
        Assert.Contains("IHDR", rawText);
        Assert.Contains("IDAT", rawText);
        Assert.Contains("IEND", rawText);
        Assert.DoesNotContain("tEXt", rawText);
        Assert.DoesNotContain("Dr. Santos", rawText);
    }

    [Fact]
    public async Task PdfSecurityScanner_CleanPdf_PassesVerdict()
    {
        var cleanPdf = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF";
        using var stream = new MemoryStream(Encoding.ASCII.GetBytes(cleanPdf));

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(stream);

        Assert.True(isClean);
        Assert.Null(quarantineReason);
    }

    [Theory]
    [InlineData("/JavaScript")]
    [InlineData("/JS")]
    [InlineData("/Launch")]
    [InlineData("/EmbeddedFiles")]
    [InlineData("/SubmitForm")]
    [InlineData("/GoToR")]
    public async Task PdfSecurityScanner_DangerousTokens_AreQuarantined(string dangerousToken)
    {
        var maliciousPdf = $"%PDF-1.7\n1 0 obj\n<< /Type /Action {dangerousToken} (app.alert('pwned')) >>\nendobj\n%%EOF";
        using var stream = new MemoryStream(Encoding.ASCII.GetBytes(maliciousPdf));

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(stream);

        Assert.False(isClean);
        Assert.NotNull(quarantineReason);
        Assert.Contains(dangerousToken, quarantineReason);
    }

    [Fact]
    public async Task PdfSecurityScanner_DetectsScript_HiddenInFlateDecodeStream()
    {
        // Create compressed stream containing /JavaScript
        byte[] compressedPayload;
        using (var compressMs = new MemoryStream())
        {
            using (var zlib = new ZLibStream(compressMs, CompressionLevel.Optimal, leaveOpen: true))
            {
                var payload = Encoding.ASCII.GetBytes("<< /Type /Action /JavaScript (malicious.payload()) >>");
                zlib.Write(payload);
            }
            compressedPayload = compressMs.ToArray();
        }

        using var ms = new MemoryStream();
        var header = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n");
        ms.Write(header);
        ms.Write(compressedPayload);
        var trailer = Encoding.ASCII.GetBytes("\nendstream\nendobj\n%%EOF");
        ms.Write(trailer);

        ms.Position = 0;

        var (isClean, quarantineReason) = await PdfSecurityScanner.ScanPdfAsync(ms);

        Assert.False(isClean);
        Assert.NotNull(quarantineReason);
        Assert.Contains("/JavaScript", quarantineReason);
    }

    [Fact]
    public void MagicByteValidator_RejectsDangerousExtensions()
    {
        Assert.True(MagicByteValidator.HasDangerousExtension("report.pdf.exe"));
        Assert.True(MagicByteValidator.HasDangerousExtension("scan.bat"));
        Assert.True(MagicByteValidator.HasDangerousExtension("image.png.vbs"));
        Assert.False(MagicByteValidator.HasDangerousExtension("lab_results.pdf"));
        Assert.False(MagicByteValidator.HasDangerousExtension("chest_xray.jpg"));
    }

    [Fact]
    public async Task UploadAttachmentCommand_SanitizesAndEncrypts_CleanUpload()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var pipeline = new AttachmentPipeline();
        var inMemoryConfig = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var storage = new LocalCommsStorageService(inMemoryConfig);

        var handler = new UploadAttachmentCommandHandler(db, pipeline, storage);

        // Build small clean JPEG
        using var ms = new MemoryStream();
        ms.Write([0xFF, 0xD8]); // SOI
        ms.Write([0xFF, 0xDB, 0x00, 0x06, 0x01, 0x02, 0x03, 0x04]); // DQT
        ms.Write([0xFF, 0xDA, 0xAA, 0xBB]); // SOS
        ms.Write([0xFF, 0xD9]); // EOI
        ms.Position = 0;

        var command = new UploadAttachmentCommand(
            ms,
            "xray.jpg",
            "image/jpeg",
            ms.Length,
            "tenant-1",
            "facility-1");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.Equal(AttachmentStatus.Clean, result.Status);
        Assert.NotEmpty(result.FileKey);
        Assert.NotEmpty(result.Sha256Checksum);

        var savedEntity = await db.MessageAttachments.FindAsync(result.AttachmentId);
        Assert.NotNull(savedEntity);
        Assert.Equal(AttachmentStatus.Clean, savedEntity.Status);
        Assert.NotEmpty(savedEntity.EncryptionIvBase64);
        Assert.NotEmpty(savedEntity.EncryptionTagBase64);
    }

    [Fact]
    public async Task UploadAttachmentCommand_Quarantines_MaliciousPdf()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var pipeline = new AttachmentPipeline();
        var inMemoryConfig = new ConfigurationBuilder().AddInMemoryCollection().Build();
        var storage = new LocalCommsStorageService(inMemoryConfig);

        var handler = new UploadAttachmentCommandHandler(db, pipeline, storage);

        var maliciousPdf = "%PDF-1.7\n<< /JS (alert(1)) >>\n%%EOF";
        using var ms = new MemoryStream(Encoding.ASCII.GetBytes(maliciousPdf));

        var command = new UploadAttachmentCommand(
            ms,
            "infected.pdf",
            "application/pdf",
            ms.Length,
            "tenant-1",
            "facility-1");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.Equal(AttachmentStatus.Quarantined, result.Status);
        Assert.NotNull(result.QuarantineReason);
        Assert.Contains("/JS", result.QuarantineReason);

        var savedEntity = await db.MessageAttachments.FindAsync(result.AttachmentId);
        Assert.NotNull(savedEntity);
        Assert.Equal(AttachmentStatus.Quarantined, savedEntity.Status);
    }

    private static void WritePngChunk(Stream stream, string type, byte[] data)
    {
        // 4 bytes length
        var lenBytes = BitConverter.GetBytes((uint)data.Length);
        if (BitConverter.IsLittleEndian) Array.Reverse(lenBytes);
        stream.Write(lenBytes);

        // 4 bytes type
        var typeBytes = Encoding.ASCII.GetBytes(type);
        stream.Write(typeBytes);

        // Data
        if (data.Length > 0)
        {
            stream.Write(data);
        }

        // 4 bytes dummy CRC
        stream.Write([0x00, 0x00, 0x00, 0x00]);
    }
}
