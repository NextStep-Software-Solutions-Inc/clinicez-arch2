using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Notifications.DTOs;

public sealed record ClinicStaffNotificationDto(
    Guid Id,
    Guid ClinicId,
    Guid? RecipientStaffId,
    string? RecipientRole,
    string Title,
    string Body,
    StaffNotificationCategory Category,
    NotificationUrgency Urgency,
    string? ActionRoute,
    string? ActionParamsJson,
    string? SourceType,
    string? SourceId,
    bool IsRead,
    DateTime? ReadAt,
    DateTime CreatedAt);

public sealed record StaffNotificationListDto(
    List<ClinicStaffNotificationDto> Items,
    int UnreadCount,
    bool HasStatAlert);
