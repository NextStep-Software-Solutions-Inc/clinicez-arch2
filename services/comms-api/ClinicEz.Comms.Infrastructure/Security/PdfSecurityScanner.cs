using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Comms.Infrastructure.Security;

public static class PdfSecurityScanner
{
    private static readonly byte[] PdfHeader = Encoding.ASCII.GetBytes("%PDF-");
    private static readonly byte[] EofMarker = Encoding.ASCII.GetBytes("%%EOF");

    private static readonly string[] DangerousTokens =
    [
        "/JavaScript",
        "/JS",
        "/Launch",
        "/EmbeddedFiles",
        "/Filespec",
        "/EF",
        "/RichMedia",
        "/XFA",
        "/SubmitForm",
        "/ImportData",
        "/GoToR",
        "/GoToE"
    ];

    public static async Task<(bool IsClean, string? QuarantineReason)> ScanPdfAsync(
        Stream inputStream,
        CancellationToken ct = default)
    {
        if (inputStream.CanSeek)
        {
            inputStream.Seek(0, SeekOrigin.Begin);
        }

        using var ms = new MemoryStream();
        await inputStream.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();

        if (bytes.Length < 10)
        {
            return (false, "File too small to be a valid PDF.");
        }

        // 1. Header check
        var headerIndex = FindBytes(bytes, PdfHeader, 0, Math.Min(bytes.Length, 1024));
        if (headerIndex == -1)
        {
            return (false, "Missing %PDF- header in document start.");
        }

        // 2. EOF marker check
        var tailStart = Math.Max(0, bytes.Length - 1024);
        var eofIndex = FindBytes(bytes, EofMarker, tailStart, bytes.Length - tailStart);
        if (eofIndex == -1)
        {
            return (false, "Missing %%EOF marker in document trailer.");
        }

        // 3. Scan uncompressed content
        var rawString = Encoding.Latin1.GetString(bytes);
        foreach (var token in DangerousTokens)
        {
            if (rawString.Contains(token, StringComparison.OrdinalIgnoreCase))
            {
                return (false, $"Active or malicious PDF token detected: '{token}'.");
            }
        }

        // 4. Scan FlateDecode streams for hidden scripts
        var streamStart = "stream";
        var streamEnd = "endstream";
        var pos = 0;

        while ((pos = rawString.IndexOf(streamStart, pos, StringComparison.Ordinal)) != -1)
        {
            var endPos = rawString.IndexOf(streamEnd, pos + 6, StringComparison.Ordinal);
            if (endPos == -1) break;

            // Stream data begins after CRLF or LF
            var dataStart = pos + 6;
            if (dataStart < bytes.Length && bytes[dataStart] == '\r') dataStart++;
            if (dataStart < bytes.Length && bytes[dataStart] == '\n') dataStart++;

            var length = endPos - dataStart;
            if (length > 0 && dataStart + length <= bytes.Length)
            {
                // Try decompressing with ZLibStream / DeflateStream
                try
                {
                    using var compressedMs = new MemoryStream(bytes, dataStart, length);
                    using var zlib = new ZLibStream(compressedMs, CompressionMode.Decompress);
                    using var decompressedMs = new MemoryStream();
                    await zlib.CopyToAsync(decompressedMs, ct);

                    var decompressedBytes = decompressedMs.ToArray();
                    var decompressedText = Encoding.Latin1.GetString(decompressedBytes);

                    foreach (var token in DangerousTokens)
                    {
                        if (decompressedText.Contains(token, StringComparison.OrdinalIgnoreCase))
                        {
                            return (false, $"Active or malicious PDF token hidden in compressed stream: '{token}'.");
                        }
                    }
                }
                catch
                {
                    // Not all streams are zlib or flate; ignore decompression failures for raw streams
                }
            }

            pos = endPos + 9;
        }

        return (true, null);
    }

    private static int FindBytes(byte[] source, byte[] pattern, int offset, int length)
    {
        if (pattern.Length == 0 || length < pattern.Length) return -1;
        var end = offset + length - pattern.Length;

        for (var i = offset; i <= end; i++)
        {
            var match = true;
            for (var j = 0; j < pattern.Length; j++)
            {
                if (source[i + j] != pattern[j])
                {
                    match = false;
                    break;
                }
            }
            if (match) return i;
        }

        return -1;
    }
}
