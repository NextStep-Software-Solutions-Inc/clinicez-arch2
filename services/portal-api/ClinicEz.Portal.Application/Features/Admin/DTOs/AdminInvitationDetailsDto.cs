using System;

namespace ClinicEz.Portal.Application.Features.Admin.DTOs;

public record AdminInvitationDetailsDto(
    string Email,
    string FullName,
    string RoleName,
    string RoleDescription,
    DateTime? ExpiresAt,
    bool IsExpired,
    bool IsAlreadyAccepted,
    bool IsRevoked,
    bool IsSuspended = false
);
