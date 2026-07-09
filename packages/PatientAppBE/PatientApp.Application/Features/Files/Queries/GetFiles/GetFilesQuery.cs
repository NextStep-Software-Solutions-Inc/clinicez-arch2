using MediatR;

namespace PatientApp.Application.Features.Files.Queries.GetFiles;

public sealed record FileFolderDto(
    Guid Id,
    Guid ClientId,
    Guid? ParentId,
    string Name,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    bool IsDeleted);

public sealed record FileRecordDto(
    Guid Id,
    Guid ClientId,
    Guid? FolderId,
    string FileName,
    string? MimeType,
    string? Extension,
    long SizeBytes,
    Guid DocumentTypeId,
    DateTime UploadedAt,
    string? EncryptionAlgorithm,
    string? EncryptionKeyId,
    string? EncryptionIvBase64,
    string? EncryptionTagBase64,
    long? EncryptedSizeBytes,
    string? EncryptedHash,
    string? WrappedKeyJson,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    bool IsDeleted);

public sealed record GetFilesResponse(
    IReadOnlyList<FileFolderDto> Folders,
    IReadOnlyList<FileRecordDto> Files);

public sealed record GetFilesQuery(Guid PatientId) : IRequest<GetFilesResponse>;
