using System;
using System.Collections.Generic;

namespace ClinicEz.Patient.Application.Common.Helpers;

public static class PatientAvatarUrlResolver
{
    private static readonly HashSet<string> AllowedExactHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "clinicezstorage.blob.core.windows.net",
        "images.clerk.dev",
        "img.clerk.com",
        "www.gravatar.com",
        "gravatar.com"
    };

    public static string? Resolve(Domain.Entities.Patient patient) =>
        Resolve(patient.Id, patient.AvatarUrl, patient.AvatarEncryptionAlgorithm, patient.AvatarEncryptedHash);

    public static string? Resolve(
        Guid patientId,
        string? avatarUrl,
        string? encryptionAlgorithm,
        string? encryptedHash)
    {
        if (string.IsNullOrWhiteSpace(avatarUrl))
        {
            return null;
        }

        if (string.Equals(encryptionAlgorithm, "AES-256-GCM", StringComparison.OrdinalIgnoreCase))
        {
            var version = !string.IsNullOrWhiteSpace(encryptedHash)
                ? (encryptedHash.Length > 12 ? encryptedHash[..12] : encryptedHash)
                : null;
            return version is not null
                ? $"/api/v1/patients/{patientId:D}/avatar?v={version}"
                : $"/api/v1/patients/{patientId:D}/avatar";
        }

        return avatarUrl.Trim();
    }

    public static bool IsAllowedExternalAvatarUrl(string? avatarUrl)
    {
        if (string.IsNullOrWhiteSpace(avatarUrl) ||
            !Uri.TryCreate(avatarUrl.Trim(), UriKind.Absolute, out var uri) ||
            !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !uri.IsDefaultPort)
        {
            return false;
        }

        var host = uri.Host.Trim().ToLowerInvariant();
        if (AllowedExactHosts.Contains(host))
        {
            return true;
        }

        const string vercelSuffix = ".public.blob.vercel-storage.com";
        if (host.EndsWith(vercelSuffix, StringComparison.Ordinal))
        {
            var prefix = host[..^vercelSuffix.Length];
            return prefix.Length > 0 && !prefix.Contains('.');
        }

        return false;
    }
}
