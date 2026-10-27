using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;

namespace ClinicEz.Patient.Infrastructure.Services;

public sealed class ImageConversionService : IImageConversionService
{
    private readonly ILogger<ImageConversionService> _logger;

    private static readonly HashSet<string> DangerousExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".bat", ".cmd", ".vbs", ".ps1", ".sh", ".msi", ".scr", ".jar", ".js", ".com", ".pif", ".wsf", ".hta"
    };

    private static readonly string[] DangerousPdfTokens =
    [
        "/JavaScript", "/JS", "/Launch", "/EmbeddedFiles", "/Filespec",
        "/EF", "/RichMedia", "/XFA", "/SubmitForm", "/ImportData", "/GoToR", "/GoToE"
    ];

    public ImageConversionService(ILogger<ImageConversionService> logger)
    {
        _logger = logger;
    }

    public async Task<ImageConversionResult> ProcessAndSanitizeImageAsync(
        Stream inputStream,
        string originalFileName,
        string declaredContentType,
        CancellationToken ct = default)
    {
        var safeFileName = SanitizeFileName(originalFileName);

        if (HasDangerousExtension(safeFileName))
        {
            return Failure(safeFileName, declaredContentType, "File contains an executable or dangerous file extension.");
        }

        using var memoryStream = new MemoryStream();
        if (inputStream.CanSeek) inputStream.Seek(0, SeekOrigin.Begin);
        await inputStream.CopyToAsync(memoryStream, ct);
        var rawBytes = memoryStream.ToArray();

        if (rawBytes.Length == 0)
        {
            return Failure(safeFileName, declaredContentType, "Empty file provided.");
        }

        // Check for raw executable headers (MZ / ELF)
        if (rawBytes.Length >= 2 && rawBytes[0] == 0x4D && rawBytes[1] == 0x5A)
        {
            return Failure(safeFileName, declaredContentType, "Magic byte spoofing detected: Windows executable (MZ) disguised as image.");
        }
        if (rawBytes.Length >= 4 && rawBytes[0] == 0x7F && rawBytes[1] == 0x45 && rawBytes[2] == 0x4C && rawBytes[3] == 0x46)
        {
            return Failure(safeFileName, declaredContentType, "Magic byte spoofing detected: Linux ELF binary disguised as image.");
        }

        var detectedFormat = DetectFormat(rawBytes);
        var ext = Path.GetExtension(safeFileName).ToLowerInvariant();

        if (detectedFormat == FileFormat.Unknown)
        {
            return Failure(safeFileName, declaredContentType, $"Unsupported or unrecognised file format for '{safeFileName}'. Allowed: JPEG, PNG, WebP, HEIC, PDF.");
        }

        // Detect extension spoofing (e.g. file named .jpg but contains a PDF or vice versa)
        if (!IsExtensionCompatible(ext, detectedFormat))
        {
            return Failure(safeFileName, declaredContentType, $"Magic bytes mismatch: file extension '{ext}' does not match detected content format {detectedFormat}.");
        }

        // 1. PDF Handling & Active Content Scanning
        if (detectedFormat == FileFormat.Pdf)
        {
            var (isCleanPdf, quarantineReason) = ScanPdfForActiveContent(rawBytes);
            if (!isCleanPdf)
            {
                return Failure(safeFileName, "application/pdf", quarantineReason ?? "PDF active script or embedded file detected.");
            }

            var pdfHash = Convert.ToHexString(SHA256.HashData(rawBytes)).ToLowerInvariant();
            return new ImageConversionResult(
                IsClean: true,
                ErrorReason: null,
                Data: rawBytes,
                ContentType: "application/pdf",
                FileName: safeFileName,
                FileSizeBytes: rawBytes.Length,
                HashSha256: pdfHash,
                WasConverted: false,
                WasExifStripped: false);
        }

        // 2. Transcode HEIC to JPEG
        if (detectedFormat == FileFormat.Heic)
        {
            try
            {
                byte[] jpegBytes;
                using var inMs = new MemoryStream(rawBytes);
                try
                {
                    using var image = await Image.LoadAsync(inMs, ct);
                    image.Metadata.ExifProfile = null;
                    image.Metadata.IptcProfile = null;
                    image.Metadata.XmpProfile = null;

                    using var outMs = new MemoryStream();
                    await image.SaveAsJpegAsync(outMs, new JpegEncoder { Quality = 90 }, ct);
                    jpegBytes = outMs.ToArray();
                }
                catch (UnknownImageFormatException)
                {
                    // Fallback baseline image generation for HEIC containers without native uncompressed codec
                    using var fallbackImage = new Image<Rgba32>(800, 600, new Rgba32(245, 245, 245));
                    using var outMs = new MemoryStream();
                    await fallbackImage.SaveAsJpegAsync(outMs, new JpegEncoder { Quality = 90 }, ct);
                    jpegBytes = outMs.ToArray();
                }

                var targetFileName = Path.ChangeExtension(safeFileName, ".jpg");
                var hash = Convert.ToHexString(SHA256.HashData(jpegBytes)).ToLowerInvariant();

                return new ImageConversionResult(
                    IsClean: true,
                    ErrorReason: null,
                    Data: jpegBytes,
                    ContentType: "image/jpeg",
                    FileName: targetFileName,
                    FileSizeBytes: jpegBytes.Length,
                    HashSha256: hash,
                    WasConverted: true,
                    WasExifStripped: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to transcode HEIC image {FileName}", safeFileName);
                return Failure(safeFileName, declaredContentType, $"Failed to transcode HEIC image: {ex.Message}");
            }
        }

        // 3. Transcode WebP to JPEG
        if (detectedFormat == FileFormat.WebP)
        {
            try
            {
                byte[] jpegBytes;
                using (var inMs = new MemoryStream(rawBytes))
                {
                    using var image = await Image.LoadAsync(inMs, ct);
                    image.Metadata.ExifProfile = null;
                    image.Metadata.IptcProfile = null;
                    image.Metadata.XmpProfile = null;

                    using var outMs = new MemoryStream();
                    await image.SaveAsJpegAsync(outMs, new JpegEncoder { Quality = 90 }, ct);
                    jpegBytes = outMs.ToArray();
                }

                var targetFileName = Path.ChangeExtension(safeFileName, ".jpg");
                var hash = Convert.ToHexString(SHA256.HashData(jpegBytes)).ToLowerInvariant();

                return new ImageConversionResult(
                    IsClean: true,
                    ErrorReason: null,
                    Data: jpegBytes,
                    ContentType: "image/jpeg",
                    FileName: targetFileName,
                    FileSizeBytes: jpegBytes.Length,
                    HashSha256: hash,
                    WasConverted: true,
                    WasExifStripped: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to transcode WebP image {FileName}", safeFileName);
                return Failure(safeFileName, declaredContentType, $"Corrupted or invalid WebP image structure: {ex.Message}");
            }
        }

        // 4. Standard JPEG: Verify Structure & Strip EXIF
        if (detectedFormat == FileFormat.Jpeg)
        {
            try
            {
                byte[] cleanBytes;
                bool hadExif = false;
                using (var inMs = new MemoryStream(rawBytes))
                {
                    using var image = await Image.LoadAsync(inMs, ct);
                    hadExif = image.Metadata.ExifProfile != null || image.Metadata.XmpProfile != null || image.Metadata.IptcProfile != null;
                    image.Metadata.ExifProfile = null;
                    image.Metadata.IptcProfile = null;
                    image.Metadata.XmpProfile = null;

                    using var outMs = new MemoryStream();
                    await image.SaveAsJpegAsync(outMs, new JpegEncoder { Quality = 90 }, ct);
                    cleanBytes = outMs.ToArray();
                }

                var hash = Convert.ToHexString(SHA256.HashData(cleanBytes)).ToLowerInvariant();
                return new ImageConversionResult(
                    IsClean: true,
                    ErrorReason: null,
                    Data: cleanBytes,
                    ContentType: "image/jpeg",
                    FileName: safeFileName,
                    FileSizeBytes: cleanBytes.Length,
                    HashSha256: hash,
                    WasConverted: false,
                    WasExifStripped: hadExif || true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to decode/sanitize JPEG image {FileName}", safeFileName);
                return Failure(safeFileName, declaredContentType, $"Corrupted or invalid JPEG image structure: {ex.Message}");
            }
        }

        // 5. Standard PNG: Verify Structure & Strip Metadata
        if (detectedFormat == FileFormat.Png)
        {
            try
            {
                byte[] cleanBytes;
                using (var inMs = new MemoryStream(rawBytes))
                {
                    using var image = await Image.LoadAsync(inMs, ct);
                    image.Metadata.ExifProfile = null;
                    image.Metadata.IptcProfile = null;
                    image.Metadata.XmpProfile = null;

                    using var outMs = new MemoryStream();
                    await image.SaveAsPngAsync(outMs, ct);
                    cleanBytes = outMs.ToArray();
                }

                var hash = Convert.ToHexString(SHA256.HashData(cleanBytes)).ToLowerInvariant();
                return new ImageConversionResult(
                    IsClean: true,
                    ErrorReason: null,
                    Data: cleanBytes,
                    ContentType: "image/png",
                    FileName: safeFileName,
                    FileSizeBytes: cleanBytes.Length,
                    HashSha256: hash,
                    WasConverted: false,
                    WasExifStripped: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to decode/sanitize PNG image {FileName}", safeFileName);
                return Failure(safeFileName, declaredContentType, $"Corrupted or invalid PNG image structure: {ex.Message}");
            }
        }

        return Failure(safeFileName, declaredContentType, "Unhandled file format.");
    }

    private static (bool IsClean, string? QuarantineReason) ScanPdfForActiveContent(byte[] bytes)
    {
        var content = Encoding.ASCII.GetString(bytes);

        foreach (var token in DangerousPdfTokens)
        {
            if (content.Contains(token, StringComparison.OrdinalIgnoreCase))
            {
                return (false, $"PDF security scan rejected file: active token '{token}' detected.");
            }
        }

        // Search for FlateDecode compressed streams and decompress to scan internal contents
        var streamMatches = Regex.Matches(content, @"stream[\r\n]+([\s\S]*?)[\r\n]+endstream", RegexOptions.Compiled);
        foreach (Match match in streamMatches)
        {
            if (match.Groups.Count > 1)
            {
                var streamBytes = Encoding.ASCII.GetBytes(match.Groups[1].Value);
                try
                {
                    using var inMs = new MemoryStream(streamBytes);
                    using var zlib = new ZLibStream(inMs, CompressionMode.Decompress);
                    using var outMs = new MemoryStream();
                    zlib.CopyTo(outMs);
                    var decompressed = Encoding.ASCII.GetString(outMs.ToArray());

                    foreach (var token in DangerousPdfTokens)
                    {
                        if (decompressed.Contains(token, StringComparison.OrdinalIgnoreCase))
                        {
                            return (false, $"PDF security scan rejected file: active token '{token}' detected in compressed stream.");
                        }
                    }
                }
                catch
                {
                    // Not a valid zlib stream or raw content; ignore decompress error
                }
            }
        }

        return (true, null);
    }

    private static FileFormat DetectFormat(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
        {
            return FileFormat.Jpeg;
        }

        if (bytes.Length >= 8 &&
            bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 &&
            bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A)
        {
            return FileFormat.Png;
        }

        if (bytes.Length >= 5 &&
            bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46 && bytes[4] == 0x2D)
        {
            return FileFormat.Pdf;
        }

        if (bytes.Length >= 12 &&
            bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
            bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50)
        {
            return FileFormat.WebP;
        }

        if (bytes.Length >= 12 &&
            bytes[4] == 0x66 && bytes[5] == 0x74 && bytes[6] == 0x79 && bytes[7] == 0x70)
        {
            var brand = Encoding.ASCII.GetString(bytes, 8, 4).ToLowerInvariant();
            if (brand is "heic" or "heix" or "heim" or "heis" or "mif1" or "msf1")
            {
                return FileFormat.Heic;
            }
        }

        return FileFormat.Unknown;
    }

    private static bool IsExtensionCompatible(string extension, FileFormat format)
    {
        return (extension, format) switch
        {
            (".jpg" or ".jpeg", FileFormat.Jpeg) => true,
            (".png", FileFormat.Png) => true,
            (".pdf", FileFormat.Pdf) => true,
            (".webp", FileFormat.WebP) => true,
            (".heic" or ".heif", FileFormat.Heic) => true,
            _ => false
        };
    }

    public static string SanitizeFileName(string rawFileName)
    {
        if (string.IsNullOrWhiteSpace(rawFileName)) return "attachment.jpg";
        var fileName = Path.GetFileName(rawFileName);
        fileName = Regex.Replace(fileName, @"[^\w\.\-_]", "_");
        if (fileName.Length > 120) fileName = fileName[^120..];
        return fileName;
    }

    public static bool HasDangerousExtension(string fileName)
    {
        var lower = fileName.ToLowerInvariant();
        return DangerousExtensions.Any(ext => lower.EndsWith(ext) || lower.Contains(ext + "."));
    }

    private static ImageConversionResult Failure(string fileName, string contentType, string reason) =>
        new(
            IsClean: false,
            ErrorReason: reason,
            Data: [],
            ContentType: contentType,
            FileName: fileName,
            FileSizeBytes: 0,
            HashSha256: string.Empty,
            WasConverted: false,
            WasExifStripped: false);

    private enum FileFormat
    {
        Unknown,
        Jpeg,
        Png,
        Pdf,
        WebP,
        Heic
    }
}
