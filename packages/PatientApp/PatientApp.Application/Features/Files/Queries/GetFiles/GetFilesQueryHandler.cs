using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Files.Queries.GetFiles;

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

        var allFolders = await _folderRepository.FindAsync(f => f.PatientId == request.PatientId, cancellationToken);
        var foldersDto = allFolders.Select(f => new FileFolderDto(
                f.Id,
                f.ClientId,
                f.ParentId,
                f.Name,
                f.CreatedAt,
                f.UpdatedAt))
            .ToList();

        var allFiles = await _fileRepository.FindAsync(f => f.PatientId == request.PatientId, cancellationToken);
        var filesDto = allFiles.Select(f => new FileRecordDto(
                f.Id,
                f.ClientId,
                f.FolderId,
                f.FileName,
                f.MimeType,
                f.Extension,
                f.SizeBytes,
                f.Category.ToString(),
                f.UploadedAt,
                f.EncryptionAlgorithm,
                f.EncryptionKeyId,
                f.EncryptionIvBase64,
                f.EncryptionTagBase64,
                f.EncryptedSizeBytes,
                f.EncryptedHash,
                f.WrappedKeyJson,
                f.CreatedAt,
                f.UpdatedAt))
            .ToList();

        return new GetFilesResponse(foldersDto, filesDto);
    }
}
