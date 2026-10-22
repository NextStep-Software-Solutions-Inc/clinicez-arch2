using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Records.Queries;

public sealed class StreamPatientRecordQueryHandler : IRequestHandler<StreamPatientRecordQuery, DecryptedFileStreamResult>
{
    private readonly IFileRecordRepository _fileRepository;
    private readonly IPatientEncryptionService _encryptionService;
    private readonly IStorageService _storageService;

    public StreamPatientRecordQueryHandler(
        IFileRecordRepository fileRepository,
        IPatientEncryptionService encryptionService,
        IStorageService storageService)
    {
        _fileRepository = fileRepository;
        _encryptionService = encryptionService;
        _storageService = storageService;
    }

    public async Task<DecryptedFileStreamResult> Handle(StreamPatientRecordQuery request, CancellationToken cancellationToken)
    {
        var record = await _fileRepository.GetByIdAndPatientIdAsync(request.FileId, request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient record '{request.FileId}' was not found.");

        await using var encryptedStream = await _storageService.OpenReadStreamAsync(record.StorageKey, cancellationToken);

        var decryptedStream = await _encryptionService.DecryptToStreamAsync(
            encryptedStream,
            record.EncryptionIvBase64 ?? string.Empty,
            record.EncryptionTagBase64 ?? string.Empty,
            record.WrappedKeyJson ?? string.Empty,
            request.PatientId,
            cancellationToken);

        decryptedStream.Position = 0;

        return new DecryptedFileStreamResult(
            Stream: decryptedStream,
            ContentType: record.MimeType ?? "application/octet-stream",
            FileName: record.FileName
        );
    }
}
