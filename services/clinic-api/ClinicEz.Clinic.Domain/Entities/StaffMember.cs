using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class StaffMember : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid? ClinicRoleId { get; set; }
    public ClinicRole? ClinicRole { get; set; }

    /// <summary>
    /// Backing JSON array of room GUIDs assigned to this Doctor or Nurse (e.g. ["guid-1", "guid-2"]).
    /// </summary>
    public string? AssignedRoomIdsJson { get; set; }

    /// <summary>
    /// Deserializes AssignedRoomIdsJson into a distinct, read-only list of room GUIDs.
    /// Returns an empty list when null, whitespace, or malformed.
    /// </summary>
    public IReadOnlyList<Guid> GetAssignedRoomIds()
    {
        if (string.IsNullOrWhiteSpace(AssignedRoomIdsJson))
        {
            return Array.Empty<Guid>();
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<List<Guid>>(AssignedRoomIdsJson);
            return parsed != null
                ? parsed.Where(id => id != Guid.Empty).Distinct().ToList()
                : Array.Empty<Guid>();
        }
        catch
        {
            return Array.Empty<Guid>();
        }
    }

    /// <summary>
    /// Updates AssignedRoomIdsJson with the provided room GUIDs, removing duplicates and Guid.Empty.
    /// Stores null if the sequence is null or contains zero valid room IDs.
    /// </summary>
    public void SetAssignedRoomIds(IEnumerable<Guid>? roomIds)
    {
        if (roomIds == null)
        {
            AssignedRoomIdsJson = null;
            return;
        }

        var distinct = roomIds
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();

        AssignedRoomIdsJson = distinct.Count > 0
            ? JsonSerializer.Serialize(distinct)
            : null;
    }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public string? MiddleName { get; set; }
    public string? Title { get; set; }

    /// <summary>
    /// Stored as string in database: "Doctor", "Nurse", "Receptionist", "Admin"
    /// </summary>
    public StaffRole Role { get; set; }

    public string? Email { get; set; }
    public string? PhoneNumber { get; set; }

    // Professional credentials
    public string? PrcLicenseNumber { get; set; }
    public string? PtrNumber { get; set; }
    public string? S2LicenseNumber { get; set; }
    public string? Specialty { get; set; }
    public string? PhilHealthPan { get; set; }

    // E-Signature Specimen & Tri-Mode Signing
    public string? SignatureSpecimen { get; set; }
    public SignatureMode DefaultSignatureMode { get; set; } = SignatureMode.ESignatureSpecimen;

    public bool IsActive { get; set; } = true;
    public StaffAccountStatus Status { get; set; } = StaffAccountStatus.Active;
    public string? InvitationToken { get; set; }
    public DateTime? InvitationExpiresAt { get; set; }
    public DateTime? InviteAcceptedAt { get; set; }

    // Facility-local credentials (no external identity provider; works fully offline on a LAN)
    public string? PasswordHash { get; set; }
    public bool MustChangePassword { get; set; }
    public int FailedLoginCount { get; set; }
    public DateTime? LockoutEnd { get; set; }
    public DateTime? LastLoginAt { get; set; }

    /// <summary>Incremented to revoke all issued access tokens and refresh tokens for this staff member.</summary>
    public int TokenVersion { get; set; }
}
