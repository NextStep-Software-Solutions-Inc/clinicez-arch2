namespace PatientAppBE.Application.Common.DTOs;

public sealed record NotificationDto(
    Guid Id,
    string Type,
    string Title,
    string Body,
    bool IsRead,
    DateTime? ReadAt,
    string? Payload,
    DateTime CreatedAt);

public sealed record NotificationListDto(
    IReadOnlyList<NotificationDto> Items,
    int UnreadCount,
    int TotalCount);
