namespace PatientApp.Application.Common.DTOs;

public sealed record OrganizationMembershipDto(
    Guid Id,
    Guid OrganizationId,
    string OrganizationName,
    string RoleId,
    string RoleName,
    string Status,
    bool ConsentDataSharing,
    DateTime? ConsentedAt,
    DateTime CreatedAt);

public sealed record ClinicMembershipDto(
    Guid Id,
    Guid ClinicId,
    string ClinicName,
    string? ClinicLogoUrl,
    string Status,
    bool ConsentDataSharing,
    DateTime? ConsentedAt,
    DateTime CreatedAt);

public sealed record BookingDraftDto(
    Guid Id,
    Guid ClinicId,
    string ClinicName,
    Guid? OrganizationId,
    DateOnly? PreferredDate,
    string? PreferredTime,
    string? Reason,
    string? Notes,
    string ShareFieldsJson,
    string Status,
    DateTime CreatedAt);

public sealed record NotificationPreferenceDto(
    Guid Id,
    string Category,
    bool PushEnabled,
    bool InAppEnabled);
