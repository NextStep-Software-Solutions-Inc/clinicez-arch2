using System;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Clinic.Application.Features.LabOrders;

public static class LabResultUploadFiles
{
    /// <summary>
    /// Decodes a base64 (or <c>data:</c> URI) result file. The content type is the caller's, else the one in the data URI,
    /// else guessed from <paramref name="documentType"/>; the intake still enforces the configured allow-list.
    /// </summary>
    public static (byte[] Content, string ContentType) Decode(string? fileBase64, string? contentType, string? documentType)
    {
        if (string.IsNullOrWhiteSpace(fileBase64))
        {
            throw new BadRequestException("A result file is required.");
        }

        var data = fileBase64.Trim();
        var mime = string.IsNullOrWhiteSpace(contentType) ? null : contentType;
        if (data.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            var comma = data.IndexOf(',');
            if (comma < 0)
            {
                throw new BadRequestException("The file data URI is malformed.");
            }

            mime ??= data[5..comma].Split(';')[0];
            data = data[(comma + 1)..];
        }

        mime ??= string.Equals(documentType, "Photo", StringComparison.OrdinalIgnoreCase) ? "image/jpeg" : "application/pdf";

        try
        {
            return (Convert.FromBase64String(data), mime);
        }
        catch (FormatException)
        {
            throw new BadRequestException("The file is not valid base64.");
        }
    }
}
