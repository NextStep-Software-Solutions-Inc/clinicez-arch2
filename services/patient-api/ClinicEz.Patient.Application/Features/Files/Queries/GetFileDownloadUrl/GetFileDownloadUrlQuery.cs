using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;
using MediatR;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Files.Queries.GetFileDownloadUrl;

public sealed record GetFileDownloadUrlQuery(Guid PatientId, Guid FileId) : IRequest<string>;

internal sealed class GetFileDownloadUrlQueryHandler : IRequestHandler<GetFileDownloadUrlQuery, string>
{
    private readonly IFileRecordRepository _fileRepository;
    private readonly IStorageService _storageService;

    public GetFileDownloadUrlQueryHandler(
        IFileRecordRepository fileRepository,
        IStorageService storageService)
    {
        _fileRepository = fileRepository;
        _storageService = storageService;
    }

    public async Task<string> Handle(GetFileDownloadUrlQuery request, CancellationToken cancellationToken)
    {
        var fileRecord = await _fileRepository.GetByIdAsync(request.FileId, cancellationToken);
        if (fileRecord == null || fileRecord.PatientId != request.PatientId)
        {
            throw new NotFoundException($"File '{request.FileId}' was not found.");
        }

        var expiresIn = TimeSpan.FromMinutes(15);
        return await _storageService.GeneratePresignedDownloadUrlAsync(fileRecord.StorageKey, expiresIn, cancellationToken);
    }
}
