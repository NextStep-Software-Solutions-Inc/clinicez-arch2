using CLINICEZ.Shared.Interfaces;
using MediatR;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Files.Commands.CompleteFileUpload;

public sealed record CompleteFileUploadCommand(
    Guid PatientId,
    Guid? FolderId,
    string OriginalName,
    string StorageKey,
    string ContentType,
    long SizeBytes,
    string EncryptionAlgorithm,
    string EncryptionKeyId,
    string EncryptionIvBase64,
    string EncryptionTagBase64,
    long EncryptedSizeBytes,
    string EncryptedHash,
    string WrappedKeyJson
) : IRequest<Guid>;

internal sealed class CompleteFileUploadCommandHandler : IRequestHandler<CompleteFileUploadCommand, Guid>
{
    private readonly IFileRecordRepository _fileRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CompleteFileUploadCommandHandler(
        IFileRecordRepository fileRepository,
        IUnitOfWork unitOfWork)
    {
        _fileRepository = fileRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Guid> Handle(CompleteFileUploadCommand request, CancellationToken cancellationToken)
    {
        var fileRecord = new FileRecord
        {
            Id = Guid.NewGuid(),
            PatientId = request.PatientId,
            FolderId = request.FolderId,
            FileName = request.OriginalName,
            StorageKey = request.StorageKey,
            MimeType = request.ContentType,
            SizeBytes = request.SizeBytes,
            UploadedAt = DateTime.UtcNow,
            Category = FileCategory.Other,
            SyncStatus = FileSyncStatus.Synced,
            
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

        return fileRecord.Id;
    }
}
