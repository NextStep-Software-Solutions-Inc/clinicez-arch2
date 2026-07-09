using CLINICEZ.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Features.Files.Queries.GetFiles;

public sealed class GetFilesQueryHandler : IRequestHandler<GetFilesQuery, GetFilesResponse>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IFileFolderRepository _folderRepository;
    private readonly IFileRecordRepository _fileRepository;

    public GetFilesQueryHandler(
        IPatientRepository patientRepository,
        IFileFolderRepository folderRepository,
        IFileRecordRepository fileRepository)
    {
        _patientRepository = patientRepository;
        _folderRepository = folderRepository;
        _fileRepository = fileRepository;
    }

    public async Task<GetFilesResponse> Handle(GetFilesQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken);
            
        if (patient == null)
            throw new NotFoundException($"Patient with ID {request.PatientId} not found.");

        var allFolders = await _folderRepository.FindWithDeletedAsync(f => f.PatientId == request.PatientId, cancellationToken);
        
        var foldersDto = allFolders.Select(f => new FileFolderDto(
                f.Id,
                f.ClientId,
                f.ParentId,
                f.Name,
                f.CreatedAt,
                f.IsDeleted ? f.DeletedAt : (f.UpdatedAt ?? f.CreatedAt),
                f.IsDeleted)) // Pass DeletedAt if IsDeleted so client knows it changed
            .ToList();

        var allFiles = await _fileRepository.FindWithDeletedAsync(f => f.PatientId == request.PatientId, cancellationToken);
        var filesDto = allFiles.Select(f => new FileRecordDto(
                f.Id,
                f.ClientId,
                f.FolderId,
                f.FileName,
                f.MimeType,
                f.Extension,
                f.SizeBytes,
                f.DocumentTypeId,
                f.UploadedAt,
                f.EncryptionAlgorithm,
                f.EncryptionKeyId,
                f.EncryptionIvBase64,
                f.EncryptionTagBase64,
                f.EncryptedSizeBytes,
                f.EncryptedHash,
                f.WrappedKeyJson,
                f.CreatedAt,
                f.IsDeleted ? f.DeletedAt : (f.UpdatedAt ?? f.CreatedAt),
                f.IsDeleted))
            .ToList();

        return new GetFilesResponse(foldersDto, filesDto);
    }
}
