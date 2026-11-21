using System;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;

namespace ClinicEz.Comms.Infrastructure.Security;

public class AttachmentPipeline : IAttachmentPipeline
{
    public async Task<SanitizedAttachmentResult> ProcessAsync(
        Stream stream,
        string fileName,
        string declaredContentType,
        CancellationToken ct = default)
    {
        var safeFileName = MagicByteValidator.SanitizeFileName(fileName);

        if (stream.CanSeek)
        {
            stream.Seek(0, SeekOrigin.Begin);
        }

        var headerBuffer = new byte[32];
        var readHeader = await stream.ReadAsync(headerBuffer.AsMemory(0, 32), ct);
        if (stream.CanSeek)
        {
            stream.Seek(0, SeekOrigin.Begin);
        }

        var (isValid, normalizedContentType, errorMessage) = MagicByteValidator.ValidateHeader(
            headerBuffer.AsSpan(0, readHeader),
            safeFileName,
            declaredContentType);

        if (!isValid || normalizedContentType == null)
        {
            return new SanitizedAttachmentResult(
                IsClean: false,
                QuarantineReason: errorMessage ?? "Unsupported file type or invalid magic bytes.",
                SanitizedBytes: [],
                StrippedExif: false,
                Sha256Hash: string.Empty,
                ContentType: declaredContentType,
                SafeFileName: safeFileName);
        }

        byte[] cleanBytes;
        bool strippedExif = false;

        switch (normalizedContentType)
        {
            case "image/jpeg":
            {
                var result = await JpegExifStripper.StripExifAsync(stream, ct);
                cleanBytes = result.SanitizedBytes;
                strippedExif = result.Stripped;
                break;
            }
            case "image/png":
            {
                var result = await PngExifStripper.StripMetadataAsync(stream, ct);
                cleanBytes = result.SanitizedBytes;
                strippedExif = result.Stripped;
                break;
            }
            case "application/pdf":
            {
                var scanResult = await PdfSecurityScanner.ScanPdfAsync(stream, ct);
                if (!scanResult.IsClean)
                {
                    return new SanitizedAttachmentResult(
                        IsClean: false,
                        QuarantineReason: scanResult.QuarantineReason ?? "PDF active content or exploit detected.",
                        SanitizedBytes: [],
                        StrippedExif: false,
                        Sha256Hash: string.Empty,
                        ContentType: normalizedContentType,
                        SafeFileName: safeFileName);
                }

                if (stream.CanSeek) stream.Seek(0, SeekOrigin.Begin);
                using var ms = new MemoryStream();
                await stream.CopyToAsync(ms, ct);
                cleanBytes = ms.ToArray();
                strippedExif = false;
                break;
            }
            default:
                return new SanitizedAttachmentResult(
                    IsClean: false,
                    QuarantineReason: $"Unsupported content type: {normalizedContentType}",
                    SanitizedBytes: [],
                    StrippedExif: false,
                    Sha256Hash: string.Empty,
                    ContentType: normalizedContentType,
                    SafeFileName: safeFileName);
        }

        var hashHex = Convert.ToHexString(SHA256.HashData(cleanBytes)).ToLowerInvariant();

        return new SanitizedAttachmentResult(
            IsClean: true,
            QuarantineReason: null,
            SanitizedBytes: cleanBytes,
            StrippedExif: strippedExif,
            Sha256Hash: hashHex,
            ContentType: normalizedContentType,
            SafeFileName: safeFileName);
    }
}
