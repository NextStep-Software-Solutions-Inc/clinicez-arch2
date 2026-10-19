using System;

namespace ClinicEz.Shared.Security.ClaimTokens;

/// <summary>
/// Verified claims payload extracted from a progressive patient account claim token.
/// </summary>
public sealed record ClaimTokenClaims
{
    public Guid JoinRequestId { get; init; }
    public string TenantSlug { get; init; }
    public string FacilitySlug { get; init; }
    public string? Email { get; init; }
    public string FirstName { get; init; }
    public string LastName { get; init; }
    public DateOnly DateOfBirth { get; init; }
    public string? MemberType { get; init; }
    public DateTime IssuedAtUtc { get; init; }
    public DateTime ExpiresAtUtc { get; init; }

    public ClaimTokenClaims(
        Guid joinRequestId,
        string tenantSlug,
        string facilitySlug,
        string? email,
        string firstName,
        string lastName,
        DateOnly dateOfBirth,
        string? memberType,
        DateTime expiresAtUtc)
    {
        JoinRequestId = joinRequestId;
        TenantSlug = tenantSlug;
        FacilitySlug = facilitySlug;
        Email = email;
        FirstName = firstName;
        LastName = lastName;
        DateOfBirth = dateOfBirth;
        MemberType = memberType;
        IssuedAtUtc = DateTime.UtcNow;
        ExpiresAtUtc = expiresAtUtc;
    }

    public ClaimTokenClaims(
        Guid joinRequestId,
        string tenantSlug,
        string facilitySlug,
        string? email,
        string firstName,
        string lastName,
        DateOnly dateOfBirth,
        string? memberType,
        DateTime issuedAtUtc,
        DateTime expiresAtUtc)
    {
        JoinRequestId = joinRequestId;
        TenantSlug = tenantSlug;
        FacilitySlug = facilitySlug;
        Email = email;
        FirstName = firstName;
        LastName = lastName;
        DateOfBirth = dateOfBirth;
        MemberType = memberType;
        IssuedAtUtc = issuedAtUtc;
        ExpiresAtUtc = expiresAtUtc;
    }
}
