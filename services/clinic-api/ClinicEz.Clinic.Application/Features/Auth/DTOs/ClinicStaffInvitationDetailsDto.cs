using System;

namespace ClinicEz.Clinic.Application.Features.Auth.DTOs;

public sealed record ClinicStaffInvitationDetailsDto(
    Guid Id,
    string ClinicName,
    string FacilitySlug,
    string InviteeFullName,
    string InviteeEmail,
    string Role,
    bool IsExpired,
    bool IsAlreadyAccepted,
    DateTime? ExpiresAt,
    bool IsRevoked = false,
    bool IsSuspended = false
);
