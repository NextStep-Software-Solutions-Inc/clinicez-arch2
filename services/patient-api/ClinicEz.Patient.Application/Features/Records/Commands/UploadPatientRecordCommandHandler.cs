using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Documents;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Records.Commands;

public sealed class UploadPatientRecordCommandHandler : IRequestHandler<UploadPatientRecordCommand, FileRecordDto>
{
    private readonly IFileRecordRepository _fileRepository;
    private readonly IDocumentTypeRepository _documentTypeRepository;
    private readonly IPatientEncryptionService _encryptionService;
    private readonly IStorageService _storageService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public UploadPatientRecordCommandHandler(
        IFileRecordRepository fileRepository,
        IDocumentTypeRepository documentTypeRepository,
        IPatientEncryptionService encryptionService,
        IStorageService storageService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _fileRepository = fileRepository;
        _documentTypeRepository = documentTypeRepository;
        _encryptionService = encryptionService;
        _storageService = storageService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<FileRecordDto> Handle(UploadPatientRecordCommand request, CancellationToken cancellationToken)
    {
        var fileId = request.ClientFileId ?? Guid.NewGuid();

        // Idempotency check: if record already exists, return existing dto
        var existing = await _fileRepository.GetByIdAndPatientIdAsync(fileId, request.PatientId, cancellationToken);
        if (existing is not null)
        {
            return ToDto(existing);
        }

        var documentType = await _documentTypeRepository.GetByIdAsync(request.DocumentTypeId, cancellationToken);
        if (documentType is null)
        {
            var activeTypes = await _documentTypeRepository.GetAllActiveAsync(cancellationToken);
            if (activeTypes is { Count: > 0 })
            {
                if (!string.IsNullOrWhiteSpace(request.DocumentTypeCode))
                {
                    documentType = activeTypes.FirstOrDefault(t =>
                        string.Equals(t.Code, request.DocumentTypeCode, StringComparison.OrdinalIgnoreCase));
                }

                documentType ??= activeTypes.FirstOrDefault(t =>
                        string.Equals(t.Code, "other", StringComparison.OrdinalIgnoreCase))
                    ?? activeTypes[0];
            }
        }

        var effectiveDocumentTypeId = documentType?.Id ?? request.DocumentTypeId;

        // Encrypt with PMK using AES-256-GCM envelope encryption
        var encrypted = await _encryptionService.EncryptAsync(
            request.Content,
            request.PatientId,
            cancellationToken);

        // Store opaque .cez ciphertext in R2
        var storageKey = $"patients/{request.PatientId}/records/{fileId}.cez";
        await _storageService.SaveEncryptedAsync(storageKey, encrypted.Ciphertext, cancellationToken);

        var safeFileName = PatientFileLimits.SafeFileName(request.FileName);
        var extension = Path.GetExtension(safeFileName).TrimStart('.').ToLowerInvariant();

        var record = new FileRecord
        {
            Id = fileId,
            ClientId = request.ClientFileId ?? fileId,
            PatientId = request.PatientId,
            DocumentTypeId = effectiveDocumentTypeId,
            DocumentType = documentType!,
            Title = request.Title,
            FileName = safeFileName,
            MimeType = request.ContentType,
            Extension = extension,
            SizeBytes = request.SizeBytes,
            StorageKey = storageKey,
            DocumentDate = request.DocumentDate,
            FacilityName = request.FacilityName,
            Notes = request.Notes,
            SyncStatus = FileSyncStatus.Synced,
            UploadedAt = DateTime.UtcNow,
            EncryptionAlgorithm = encrypted.EncryptionAlgorithm,
            EncryptionIvBase64 = encrypted.IvBase64,
            EncryptionTagBase64 = encrypted.TagBase64,
            EncryptedSizeBytes = encrypted.EncryptedSizeBytes,
            EncryptedHash = encrypted.EncryptedHash,
            WrappedKeyJson = encrypted.WrappedKeyJson,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _currentUserService.UserId ?? request.PatientId.ToString()
        };

        await _fileRepository.AddAsync(record, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return ToDto(record);
    }

    private static FileRecordDto ToDto(FileRecord record) => new(
        Id: record.Id,
        ClientId: record.ClientId,
        FileName: record.FileName,
        MimeType: record.MimeType,
        Extension: record.Extension,
        SizeBytes: record.SizeBytes,
        DocumentTypeId: record.DocumentTypeId,
        DocumentTypeName: record.DocumentType?.Label,
        Title: record.Title,
        DocumentDate: record.DocumentDate,
        FacilityName: record.FacilityName,
        Notes: record.Notes,
        UploadedAt: record.UploadedAt,
        StorageKey: record.StorageKey
    );
}
