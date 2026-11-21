using System;
using ClinicEz.Portal.Domain.Entities;

namespace ClinicEz.Portal.Application.Features.Admin.DTOs;

public record AdminUserDto
{
    public Guid Id { get; init; }
    public string? ClerkUserId { get; init; }
    public string Email { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public Guid RoleId { get; init; }
    public AdminRole? Role { get; init; }
    public bool IsActive { get; init; }
    public AdminUserStatus Status { get; init; }
    public string DisplayStatus { get; init; } = string.Empty;
    public string? InvitationToken { get; init; }
    public DateTime? InvitationExpiresAt { get; init; }
    public DateTime? JoinedAt { get; init; }
    public DateTime CreatedAt { get; init; }
    public string CreatedBy { get; init; } = string.Empty;
    public DateTime? UpdatedAt { get; init; }
    public string? UpdatedBy { get; init; }
    public string? InviteUrl { get; init; }
}

public static class AdminUserMapping
{
    public static AdminUserDto ToDto(AdminUser user, TimeProvider? timeProvider = null, string? baseUrl = null)
    {
        var now = timeProvider?.GetUtcNow().UtcDateTime ?? DateTime.UtcNow;
        var isExpired = user.Status == AdminUserStatus.Invited &&
                        user.InvitationExpiresAt.HasValue &&
                        user.InvitationExpiresAt.Value < now;

        var displayStatus = isExpired ? "Expired" : user.Status.ToString();

        string? inviteUrl = null;
        if (!string.IsNullOrEmpty(user.InvitationToken) && !string.IsNullOrEmpty(baseUrl))
        {
            inviteUrl = user.InvitationToken.StartsWith("pwdreset_", StringComparison.OrdinalIgnoreCase)
                ? $"{baseUrl.TrimEnd('/')}/reset-password/{user.InvitationToken}"
                : $"{baseUrl.TrimEnd('/')}/invitations/{user.InvitationToken}";
        }

        return new AdminUserDto
        {
            Id = user.Id,
            ClerkUserId = user.ClerkUserId,
            Email = user.Email,
            FullName = user.FullName,
            RoleId = user.RoleId,
            Role = user.Role,
            IsActive = user.IsActive,
            Status = user.Status,
            DisplayStatus = displayStatus,
            InvitationToken = user.InvitationToken,
            InvitationExpiresAt = user.InvitationExpiresAt,
            JoinedAt = user.JoinedAt,
            CreatedAt = user.CreatedAt,
            CreatedBy = user.CreatedBy,
            UpdatedAt = user.UpdatedAt,
            UpdatedBy = user.UpdatedBy,
            InviteUrl = inviteUrl
        };
    }
}
