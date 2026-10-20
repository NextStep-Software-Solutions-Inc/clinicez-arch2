using System;

namespace ClinicEz.Clinic.Infrastructure.Common;

/// <summary>
/// Safe decoding helper for base64 strings and Data URIs (e.g. logos and signature specimens).
/// Handles corrupt strings, data URI prefixes, whitespace, and padding errors gracefully.
/// </summary>
public static class ImageDecoderHelper
{
    public static byte[]? TryDecode(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return null;

        try
        {
            var trimmed = input.Trim();
            if (trimmed.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            {
                var commaIndex = trimmed.IndexOf(',');
                if (commaIndex >= 0)
                {
                    trimmed = trimmed[(commaIndex + 1)..].Trim();
                }
            }

            // Clean up any inner whitespace/newlines
            trimmed = trimmed.Replace("\r", "").Replace("\n", "").Replace(" ", "");

            if (string.IsNullOrWhiteSpace(trimmed))
                return null;

            var bytes = Convert.FromBase64String(trimmed);
            try
            {
                QuestPDF.Infrastructure.Image.FromBinaryData(bytes);
                return bytes;
            }
            catch
            {
                return null;
            }
        }
        catch
        {
            return null;
        }
    }
}
