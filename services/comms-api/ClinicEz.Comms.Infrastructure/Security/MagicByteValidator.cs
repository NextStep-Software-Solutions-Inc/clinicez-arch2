using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace ClinicEz.Comms.Infrastructure.Security;

public static class MagicByteValidator
{
    private static readonly Dictionary<string, byte[][]> MagicSignatures = new(StringComparer.OrdinalIgnoreCase)
    {
        ["application/pdf"] = [[0x25, 0x50, 0x44, 0x46, 0x2D]], // %PDF-
        ["image/jpeg"] = [[0xFF, 0xD8, 0xFF]],
        ["image/png"] = [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]]
    };

    private static readonly Dictionary<string, string> ExtensionToMime = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = "application/pdf",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png"
    };

    private static readonly HashSet<string> DangerousExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".bat", ".cmd", ".vbs", ".ps1", ".sh", ".msi", ".scr", ".jar", ".js", ".com", ".pif", ".wsf", ".hta"
    };

    public static string SanitizeFileName(string rawFileName)
    {
        if (string.IsNullOrWhiteSpace(rawFileName)) return "attachment";
        var fileName = Path.GetFileName(rawFileName); // Strips path traversal
        fileName = Regex.Replace(fileName, @"[^\w\.\-_]", "_");
        if (fileName.Length > 120) fileName = fileName[^120..];
        return fileName;
    }

    public static bool HasDangerousExtension(string fileName)
    {
        var lower = fileName.ToLowerInvariant();
        return DangerousExtensions.Any(ext => lower.EndsWith(ext) || lower.Contains(ext + "."));
    }

    public static (bool IsValid, string? NormalizedContentType, string? ErrorMessage) ValidateHeader(
        ReadOnlySpan<byte> headerBytes,
        string fileName,
        string declaredContentType)
    {
        if (HasDangerousExtension(fileName))
        {
            return (false, null, "File contains an executable or dangerous file extension.");
        }

        var ext = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(ext) || !ExtensionToMime.TryGetValue(ext, out var expectedMime))
        {
            return (false, null, $"File extension '{ext}' is not supported. Allowed: .pdf, .jpg, .jpeg, .png");
        }

        if (!expectedMime.Equals(declaredContentType, StringComparison.OrdinalIgnoreCase))
        {
            // If declared as generic stream or slightly off, use expected from extension if magic matches
        }

        if (!MagicSignatures.TryGetValue(expectedMime, out var signatures))
        {
            return (false, null, $"Unsupported MIME type: {expectedMime}");
        }

        var matchesAny = false;
        foreach (var sig in signatures)
        {
            if (headerBytes.Length >= sig.Length && headerBytes[..sig.Length].SequenceEqual(sig))
            {
                matchesAny = true;
                break;
            }
        }

        if (!matchesAny)
        {
            return (false, null, $"Magic bytes mismatch: file content does not match expected {expectedMime} format.");
        }

        return (true, expectedMime, null);
    }
}
