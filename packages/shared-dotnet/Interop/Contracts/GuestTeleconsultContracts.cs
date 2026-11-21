using System;

namespace ClinicEz.Shared.Interop.Contracts;

/// <summary>Payload for <c>portal.teleconsult.guest_invite_issued</c>.</summary>
public sealed record GuestTeleconsultInviteIssuedPayload(
    Guid AppointmentId,
    Guid CallId,
    string TenantId,
    string FacilityId,
    string InviteTokenHash,
    string ExpectedDobHash,
    string OtpHash,
    DateTime ExpiresAtUtc,
    DateTime IssuedAtUtc,
    string? ClinicName = null,
    string? ClinicSupportPhone = null,
    string? ClinicianName = null,
    DateTime? ScheduledAtUtc = null,
    string? EncryptedGuestContext = null);

/// <summary>Payload for <c>portal.teleconsult.guest_invite_revoked</c>.</summary>
public sealed record GuestTeleconsultInviteRevokedPayload(
    Guid AppointmentId,
    Guid CallId,
    string TenantId,
    string FacilityId,
    DateTime RevokedAtUtc,
    string Reason);
