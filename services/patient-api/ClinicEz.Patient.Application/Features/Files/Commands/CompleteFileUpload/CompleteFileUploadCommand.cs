using ClinicEz.Shared.Interfaces;
using MediatR;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Files.Commands.CompleteFileUpload;

public sealed record CompleteFileUploadCommand(Guid FileId) : IRequest<Guid>;

internal sealed class CompleteFileUploadCommandHandler : IRequestHandler<CompleteFileUploadCommand, Guid>
{
    private readonly IFileRecordRepository _fileRepository;
    private readonly IPatientStorageProfileRepository _storageProfileRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CompleteFileUploadCommandHandler(
        IFileRecordRepository fileRepository,
        IPatientStorageProfileRepository storageProfileRepository,
        IUnitOfWork unitOfWork)
    {
        _fileRepository = fileRepository;
        _storageProfileRepository = storageProfileRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Guid> Handle(CompleteFileUploadCommand request, CancellationToken cancellationToken)
    {
        var fileRecord = await _fileRepository.GetByIdAsync(request.FileId, cancellationToken);
        if (fileRecord == null)
            throw new Exception("File not found");

        if (fileRecord.SyncStatus == FileSyncStatus.Syncing)
        {
            fileRecord.SyncStatus = FileSyncStatus.Synced;
            _fileRepository.Update(fileRecord);
            
            var profile = await _storageProfileRepository.GetByPatientIdAsync(fileRecord.PatientId, cancellationToken);
            if (profile != null)
            {
                profile.UsedBytes += fileRecord.EncryptedSizeBytes ?? fileRecord.SizeBytes;
                _storageProfileRepository.Update(profile);
            }

            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return fileRecord.Id;
    }
}
