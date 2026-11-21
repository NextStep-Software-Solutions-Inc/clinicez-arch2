using System;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Clinic.Application.Common.Helpers;

/// <summary>
/// Shared directory opt-in validation rules for clinical staff (Doctors and Nurses).
/// </summary>
public static class ClinicianDirectoryValidationHelper
{
    public static bool IsClinicianRole(StaffRole role) =>
        role is StaffRole.Doctor or StaffRole.Nurse;

    public static bool IsClinicianVerificationReady(
        StaffRole role,
        bool isActive,
        string? prcLicenseNumber,
        DateOnly? prcExpiryDate,
        string? prcEvidenceObjectKey,
        string? verificationContact,
        DateOnly? today = null)
    {
        var currentDay = today ?? DateOnly.FromDateTime(DateTime.UtcNow);
        return isActive
            && IsClinicianRole(role)
            && PractitionerIdentity.IsValidPrcFormat(prcLicenseNumber)
            && prcExpiryDate.HasValue
            && prcExpiryDate.Value >= currentDay
            && !string.IsNullOrWhiteSpace(prcEvidenceObjectKey)
            && !string.IsNullOrWhiteSpace(verificationContact);
    }

    public static void ValidateOptInRequirements(
        StaffRole role,
        bool isDirectoryOptIn,
        string? prcLicenseNumber,
        DateOnly? prcExpiryDate,
        string? prcEvidenceObjectKey,
        string? verificationContact)
    {
        if (!isDirectoryOptIn)
        {
            return;
        }

        if (!IsClinicianRole(role))
        {
            throw new ValidationException("Only Doctors and Nurses can opt into the public directory.");
        }

        if (!PractitionerIdentity.IsValidPrcFormat(prcLicenseNumber))
        {
            throw new ValidationException("A valid PRC license number is required for directory verification.");
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (!prcExpiryDate.HasValue || prcExpiryDate.Value < today)
        {
            throw new ValidationException("A valid, non-expired PRC expiry date is required for directory verification.");
        }

        if (string.IsNullOrWhiteSpace(prcEvidenceObjectKey))
        {
            throw new ValidationException("PRC proof document must be uploaded before opting into directory verification.");
        }

        if (string.IsNullOrWhiteSpace(verificationContact))
        {
            throw new ValidationException("A practitioner verification contact is required for directory verification.");
        }
    }

    public static bool HasPrcLicenseChanged(string? previousPrc, string? updatedPrc)
    {
        var prevNormalized = PractitionerIdentity.NormalizePrc(previousPrc) ?? previousPrc?.Trim();
        var nextNormalized = PractitionerIdentity.NormalizePrc(updatedPrc) ?? updatedPrc?.Trim();
        return !string.Equals(prevNormalized, nextNormalized, StringComparison.OrdinalIgnoreCase);
    }

    public static bool HasRegulatedPrcCredentialsChanged(
        string? previousPrc,
        string? updatedPrc,
        DateOnly? previousExpiry,
        DateOnly? updatedExpiry,
        string? previousProofKey,
        string? updatedProofKey)
    {
        if (HasPrcLicenseChanged(previousPrc, updatedPrc))
        {
            return true;
        }

        if (previousExpiry != updatedExpiry)
        {
            return true;
        }

        var prevKey = string.IsNullOrWhiteSpace(previousProofKey) ? null : previousProofKey.Trim();
        var nextKey = string.IsNullOrWhiteSpace(updatedProofKey) ? null : updatedProofKey.Trim();
        return !string.Equals(prevKey, nextKey, StringComparison.Ordinal);
    }
}
