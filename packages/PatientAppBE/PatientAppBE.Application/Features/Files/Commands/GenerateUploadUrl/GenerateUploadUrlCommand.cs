using Clinic EZ.Shared.Interfaces;
using MediatR;
using PatientAppBE.Application.Common.Interfaces;

namespace PatientAppBE.Application.Features.Files.Commands.GenerateUploadUrl;

public sealed record GenerateUploadUrlCommand(
    Guid PatientId,
    Guid? FileId,
    Guid DocumentTypeId,
    Guid? FolderId,
    string OriginalName,
    string ContentType,
    long SizeBytes,
    string EncryptionAlgorithm,
    string EncryptionKeyId,
    string EncryptionIvBase64,
    string EncryptionTagBase64,
    long EncryptedSizeBytes,
    string EncryptedHash,
    string WrappedKeyJson
) : IRequest<GenerateUploadUrlResponse>;

internal sealed class GenerateUploadUrlCommandHandler : IRequestHandler<GenerateUploadUrlCommand, GenerateUploadUrlResponse>
{
    private readonly IStorageService _storageService;
    private readonly PatientAppBE.Domain.Interfaces.IFileRecordRepository _fileRepository;
    private readonly PatientAppBE.Domain.Interfaces.IUnitOfWork _unitOfWork;

    public GenerateUploadUrlCommandHandler(
        IStorageService storageService,
        PatientAppBE.Domain.Interfaces.IFileRecordRepository fileRepository,
        PatientAppBE.Domain.Interfaces.IUnitOfWork unitOfWork)
    {
        _storageService = storageService;
        _fileRepository = fileRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<GenerateUploadUrlResponse> Handle(GenerateUploadUrlCommand request, CancellationToken cancellationToken)
    {
        var fileExtension = System.IO.Path.GetExtension(request.OriginalName);
        var fileId = request.FileId ?? Guid.NewGuid();
        var storageKey = $"patients/{request.PatientId}/files/{fileId}{fileExtension}";

        var fileRecord = new PatientAppBE.Domain.Entities.FileRecord
        {
            Id = fileId,
            PatientId = request.PatientId,
            FolderId = request.FolderId,
            FileName = request.OriginalName,
            StorageKey = storageKey,
            MimeType = request.ContentType,
            Extension = fileExtension,
            SizeBytes = request.SizeBytes,
            UploadedAt = DateTime.UtcNow,
            DocumentTypeId = request.DocumentTypeId,
            SyncStatus = PatientAppBE.Domain.Enums.FileSyncStatus.Syncing,
            
            EncryptionAlgorithm = request.EncryptionAlgorithm,
            EncryptionKeyId = request.EncryptionKeyId,
            EncryptionIvBase64 = request.EncryptionIvBase64,
            EncryptionTagBase64 = request.EncryptionTagBase64,
            EncryptedSizeBytes = request.EncryptedSizeBytes,
            EncryptedHash = request.EncryptedHash,
            WrappedKeyJson = request.WrappedKeyJson,

            CreatedBy = request.PatientId.ToString()
        };

        await _fileRepository.AddAsync(fileRecord, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var expiresIn = TimeSpan.FromMinutes(15);
        var uploadUrl = await _storageService.GeneratePresignedUploadUrlAsync(storageKey, request.ContentType, expiresIn, cancellationToken);

        return new GenerateUploadUrlResponse(fileId, storageKey, uploadUrl, DateTime.UtcNow.Add(expiresIn));
    }
}
