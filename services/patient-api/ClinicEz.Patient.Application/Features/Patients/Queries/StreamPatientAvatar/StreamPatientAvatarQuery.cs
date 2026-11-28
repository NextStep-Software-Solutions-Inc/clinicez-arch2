using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Helpers;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.StreamPatientAvatar;

public sealed record StreamPatientAvatarResult(
    Stream Stream,
    string ContentType,
    string? ETag = null,
    string? ExternalRedirectUrl = null
);

public sealed record StreamPatientAvatarQuery(Guid PatientId) : IRequest<StreamPatientAvatarResult>;

public sealed class StreamPatientAvatarQueryHandler : IRequestHandler<StreamPatientAvatarQuery, StreamPatientAvatarResult>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IPatientEncryptionService _encryptionService;
    private readonly IStorageService _storageService;

    public StreamPatientAvatarQueryHandler(
        IPatientRepository patientRepository,
        IPatientEncryptionService encryptionService,
        IStorageService storageService)
    {
        _patientRepository = patientRepository;
        _encryptionService = encryptionService;
        _storageService = storageService;
    }

    public async Task<StreamPatientAvatarResult> Handle(StreamPatientAvatarQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        if (string.IsNullOrWhiteSpace(patient.AvatarUrl))
        {
            throw new NotFoundException($"Avatar for patient '{request.PatientId}' was not found.");
        }

        if (!string.Equals(patient.AvatarEncryptionAlgorithm, "AES-256-GCM", StringComparison.OrdinalIgnoreCase))
        {
            if (PatientAvatarUrlResolver.IsAllowedExternalAvatarUrl(patient.AvatarUrl))
            {
                return new StreamPatientAvatarResult(
                    Stream: Stream.Null,
                    ContentType: string.IsNullOrWhiteSpace(patient.AvatarContentType) ? "image/jpeg" : patient.AvatarContentType,
                    ETag: null,
                    ExternalRedirectUrl: patient.AvatarUrl.Trim());
            }

            throw new NotFoundException($"Avatar for patient '{request.PatientId}' is not available.");
        }

        if (string.IsNullOrWhiteSpace(patient.AvatarEncryptionIvBase64) ||
            string.IsNullOrWhiteSpace(patient.AvatarEncryptionTagBase64) ||
            string.IsNullOrWhiteSpace(patient.AvatarWrappedKeyJson))
        {
            throw new NotFoundException($"Encrypted avatar metadata for patient '{request.PatientId}' is incomplete.");
        }

        await using var encryptedStream = await _storageService.OpenReadStreamAsync(patient.AvatarUrl, cancellationToken);
        var decryptedStream = await _encryptionService.DecryptToStreamAsync(
            encryptedStream,
            patient.AvatarEncryptionIvBase64,
            patient.AvatarEncryptionTagBase64,
            patient.AvatarWrappedKeyJson,
            request.PatientId,
            cancellationToken);

        decryptedStream.Position = 0;

        return new StreamPatientAvatarResult(
            Stream: decryptedStream,
            ContentType: string.IsNullOrWhiteSpace(patient.AvatarContentType) ? "image/jpeg" : patient.AvatarContentType,
            ETag: patient.AvatarEncryptedHash);
    }
}
