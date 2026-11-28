using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public static class PatientAvatarUrlResolver
{
    public static string? Resolve(Patient patient) =>
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

    private static readonly HashSet<string> AllowedExactHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "clinicezstorage.blob.core.windows.net",
        "images.clerk.dev",
        "img.clerk.com",
        "www.gravatar.com",
        "gravatar.com"
    };
}

public sealed record DownloadPatientAvatarResult(
    byte[] FileBytes,
    string ContentType,
    string? ETag = null,
    string? ExternalRedirectUrl = null
);

public sealed record DownloadPatientAvatarQuery(Guid PatientId) : IRequest<DownloadPatientAvatarResult?>;

public sealed class DownloadPatientAvatarQueryHandler : IRequestHandler<DownloadPatientAvatarQuery, DownloadPatientAvatarResult?>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicEncryptionService _encryptionService;
    private readonly IClinicStorageService _storageService;

    public DownloadPatientAvatarQueryHandler(
        IRepository<Patient> patientRepo,
        IClinicContext clinicContext,
        IClinicEncryptionService encryptionService,
        IClinicStorageService storageService)
    {
        _patientRepo = patientRepo;
        _clinicContext = clinicContext;
        _encryptionService = encryptionService;
        _storageService = storageService;
    }

    public async Task<DownloadPatientAvatarResult?> Handle(DownloadPatientAvatarQuery request, CancellationToken ct)
    {
        var patient = await _patientRepo.GetByIdAsync(request.PatientId, ct);
        if (patient == null || patient.IsDeleted || string.IsNullOrWhiteSpace(patient.AvatarUrl))
        {
            return null;
        }

        if (_clinicContext.ClinicId != Guid.Empty && patient.ClinicId != _clinicContext.ClinicId)
        {
            return null;
        }

        if (!string.Equals(patient.AvatarEncryptionAlgorithm, "AES-256-GCM", StringComparison.OrdinalIgnoreCase))
        {
            if (PatientAvatarUrlResolver.IsAllowedExternalAvatarUrl(patient.AvatarUrl))
            {
                return new DownloadPatientAvatarResult(
                    Array.Empty<byte>(),
                    string.IsNullOrWhiteSpace(patient.AvatarContentType) ? "image/jpeg" : patient.AvatarContentType,
                    ETag: null,
                    ExternalRedirectUrl: patient.AvatarUrl.Trim());
            }

            return null;
        }

        if (string.IsNullOrWhiteSpace(patient.AvatarEncryptionIvBase64) ||
            string.IsNullOrWhiteSpace(patient.AvatarEncryptionTagBase64) ||
            string.IsNullOrWhiteSpace(patient.AvatarWrappedKeyJson))
        {
            return null;
        }

        var exists = await _storageService.FileExistsAsync(patient.AvatarUrl, ct);
        if (!exists)
        {
            return null;
        }

        var ciphertext = await _storageService.ReadEncryptedFileAsync(patient.AvatarUrl, ct);
        var tenantId = !string.IsNullOrWhiteSpace(patient.TenantId) ? patient.TenantId : (_clinicContext.TenantId ?? "default");
        var clinicId = patient.ClinicId != Guid.Empty ? patient.ClinicId : _clinicContext.ClinicId;
        var plaintext = await _encryptionService.DecryptAsync(
            ciphertext,
            patient.AvatarEncryptionIvBase64,
            patient.AvatarEncryptionTagBase64,
            patient.AvatarWrappedKeyJson,
            tenantId,
            clinicId,
            ct);

        return new DownloadPatientAvatarResult(
            plaintext,
            string.IsNullOrWhiteSpace(patient.AvatarContentType) ? "image/jpeg" : patient.AvatarContentType,
            ETag: patient.AvatarEncryptedHash);
    }
}
