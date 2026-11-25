using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.DirectoryVerification;

public sealed record VerificationEvidenceLookupOutcome(
    PortalEvidenceFile? File,
    bool ClinicUnavailable = false,
    string? ErrorMessage = null);

/// <summary>
/// Resolves DOH LTO and PRC verification proof files either from portal control-plane storage
/// (for files uploaded directly in the tenant portal) or on-demand from the clinic facility over
/// the Interop Hub (for files uploaded in the clinic workstation).
/// </summary>
public static class VerificationEvidenceResolver
{
    private static readonly TimeSpan InteropTimeout = TimeSpan.FromSeconds(25);

    public static async Task<VerificationEvidenceLookupOutcome> ResolveAsync(
        IPortalEvidenceStorageService storage,
        IInteropRequestClient? interopClient,
        Guid tenantId,
        Guid facilityId,
        string? objectKey,
        ILogger? logger,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            return new VerificationEvidenceLookupOutcome(null, ErrorMessage: "No verification proof file is attached.");
        }

        var trimmedKey = objectKey.Trim();

        // 1. Check local portal storage first (fast path for portal-uploaded or cached proofs)
        try
        {
            var localFile = await storage.ReadEvidenceAsync(trimmedKey, ct);
            if (localFile != null && localFile.Content.Length > 0)
            {
                return new VerificationEvidenceLookupOutcome(new PortalEvidenceFile(
                    localFile.Content,
                    NormalizeContentType(localFile.ContentType, trimmedKey),
                    SanitizeFileName(localFile.FileName, trimmedKey)));
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger?.LogWarning(
                ex,
                "Failed reading verification evidence '{ObjectKey}' from portal storage; falling back to clinic Interop.",
                trimmedKey);
        }

        // 2. Fallback to clinic storage via Interop Hub request/reply (for clinic-uploaded LTO & PRC proofs)
        if (interopClient == null)
        {
            return new VerificationEvidenceLookupOutcome(null, ErrorMessage: "Verification evidence file was not found.");
        }

        var target = Party.ForFacility(tenantId.ToString(), facilityId.ToString(), FacilityType.Clinic);
        try
        {
            var reply = await interopClient.RequestAsync<VerificationEvidenceRequestedPayload, VerificationEvidenceRespondedPayload>(
                InteropTypes.VerificationEvidenceRequested,
                InteropTypes.VerificationEvidenceResponded,
                Party.Portal,
                target,
                new VerificationEvidenceRequestedPayload { ObjectKey = trimmedKey },
                InteropTimeout,
                ct);

            if (!reply.Found || string.IsNullOrWhiteSpace(reply.Base64Content))
            {
                return new VerificationEvidenceLookupOutcome(
                    null,
                    ErrorMessage: reply.Error ?? "Verification evidence file was not found in clinic storage.");
            }

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(reply.Base64Content);
            }
            catch (FormatException)
            {
                return new VerificationEvidenceLookupOutcome(
                    null,
                    ClinicUnavailable: true,
                    ErrorMessage: "Clinic returned a malformed verification evidence payload.");
            }

            if (bytes.Length == 0)
            {
                return new VerificationEvidenceLookupOutcome(
                    null,
                    ErrorMessage: "Clinic returned an empty verification evidence payload.");
            }

            var contentType = NormalizeContentType(reply.ContentType, trimmedKey);
            var fileName = SanitizeFileName(reply.FileName, trimmedKey);

            // 3. Write-through cache into portal storage so subsequent previews work even if clinic goes offline
            try
            {
                await storage.SaveCachedEvidenceAsync(
                    tenantId,
                    facilityId,
                    trimmedKey,
                    contentType,
                    fileName,
                    bytes,
                    ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                logger?.LogWarning(
                    ex,
                    "Failed to write-through cache verification evidence '{ObjectKey}' in portal storage.",
                    trimmedKey);
            }

            return new VerificationEvidenceLookupOutcome(new PortalEvidenceFile(bytes, contentType, fileName));
        }
        catch (InteropRequestTimeoutException ex)
        {
            logger?.LogWarning(
                ex,
                "Timeout fetching verification evidence '{ObjectKey}' from clinic {FacilityId}",
                trimmedKey, facilityId);
            return new VerificationEvidenceLookupOutcome(
                null,
                ClinicUnavailable: true,
                ErrorMessage: "The clinic workstation is currently offline or did not respond in time to stream this document.");
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger?.LogError(
                ex,
                "Unexpected error fetching verification evidence '{ObjectKey}' from clinic {FacilityId}",
                trimmedKey, facilityId);
            return new VerificationEvidenceLookupOutcome(
                null,
                ClinicUnavailable: true,
                ErrorMessage: "Unable to retrieve verification evidence from the clinic right now.");
        }
    }

    public static string SanitizeFileName(string? fileName, string? objectKey)
    {
        var raw = !string.IsNullOrWhiteSpace(fileName)
            ? Path.GetFileName(fileName.Trim())
            : Path.GetFileName(objectKey ?? string.Empty);

        if (string.IsNullOrWhiteSpace(raw))
            return "verification-evidence";

        var decomposed = raw.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var ch in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark)
                continue;
            if (char.IsAsciiLetterOrDigit(ch) || ch is '.' or '-' or '_' or ' ')
                sb.Append(ch);
        }

        var cleaned = sb.ToString().Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "verification-evidence" : cleaned;
    }

    public static string NormalizeContentType(string? contentType, string objectKey)
    {
        if (!string.IsNullOrWhiteSpace(contentType))
        {
            var semi = contentType.IndexOf(';');
            var clean = (semi >= 0 ? contentType[..semi] : contentType).Trim().ToLowerInvariant();
            if (clean is "application/pdf" or "image/jpeg" or "image/png")
                return clean;
            if (clean == "image/jpg")
                return "image/jpeg";
        }

        return Path.GetExtension(objectKey).ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            _ => "application/octet-stream"
        };
    }
}
