using CLINICEZ.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Interfaces;

namespace PatientApp.Application.Features.Files.Queries.GetFiles;

public sealed class GetFilesQueryHandler : IRequestHandler<GetFilesQuery, GetFilesResponse>
{
    private readonly IApplicationDbContext _context;

    public GetFilesQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<GetFilesResponse> Handle(GetFilesQuery request, CancellationToken cancellationToken)
    {
        var patientExists = await _context.Patients
            .AnyAsync(p => p.Id == request.PatientId, cancellationToken);
            
        if (!patientExists)
            throw new NotFoundException($"Patient with ID {request.PatientId} not found.");

        var folders = await _context.FileFolders
            .AsNoTracking()
            .Where(f => f.PatientId == request.PatientId)
            .Select(f => new FileFolderDto(
                f.Id,
                f.ClientId,
                f.ParentId,
                f.Name,
                f.CreatedAt,
                f.UpdatedAt))
            .ToListAsync(cancellationToken);

        var files = await _context.FileRecords
            .AsNoTracking()
            .Where(f => f.PatientId == request.PatientId)
            .Select(f => new FileRecordDto(
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
            .ToListAsync(cancellationToken);

        return new GetFilesResponse(folders, files);
    }
}
