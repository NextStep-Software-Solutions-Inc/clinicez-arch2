namespace PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;

public sealed record CheckUploadStatusResponse(
    bool IsSuccess,
    string? RawXml,
    string? ErrorCode,
    string? ErrorMessage);
