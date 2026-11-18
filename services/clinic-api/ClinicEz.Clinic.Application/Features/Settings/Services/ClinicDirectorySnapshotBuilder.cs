using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Features.Settings.Services;

/// <summary>
/// Pure snapshot builder shared by Application sync services and Infrastructure inbound handlers
/// to keep <see cref="FacilityCreatedEvent"/> and verification payloads consistent.
/// </summary>
public static class ClinicDirectorySnapshotBuilder
{
    public static string MapClassification(string? specialtyMode) =>
        specialtyMode?.Trim().ToLowerInvariant() switch
        {
            "dental" => "Dental Clinic",
            "multispecialty" or "multi-specialty" => "Multi-Specialty Clinic",
            "medical" => "Ambulatory Clinic",
            _ => "Ambulatory Clinic"
        };

    public static IReadOnlyList<ProviderAvailabilityWindowDto> MapAvailabilities(
        Guid staffId,
        IReadOnlyList<DoctorScheduleTemplate> scheduleTemplates)
    {
        return scheduleTemplates
            .Where(t => t.DoctorId == staffId && t.IsActive && !t.IsDeleted)
            .OrderBy(t => t.DayOfWeek)
            .ThenBy(t => t.StartTime)
            .Select(t => new ProviderAvailabilityWindowDto(
                t.DayOfWeek,
                t.StartTime.ToString("HH:mm"),
                t.EndTime.ToString("HH:mm"),
                t.SlotDurationMinutes))
            .ToList();
    }

    public static string FormatProviderName(StaffMember staff)
    {
        var fullName = $"{staff.FirstName} {staff.LastName}".Trim();
        return staff.Role == StaffRole.Doctor ? $"Dr. {fullName}".Trim() : fullName;
    }

    public static string ResolveSpecialty(StaffMember staff) =>
        !string.IsNullOrWhiteSpace(staff.Specialty)
            ? staff.Specialty
            : (staff.Role == StaffRole.Nurse ? "Nursing" : "General Practice");

    public static FacilityCreatedEvent BuildFacilityDirectoryEvent(
        FacilitySettings settings,
        IReadOnlyList<StaffMember> staffMembers,
        IReadOnlyList<ServiceItem> serviceItems,
        IReadOnlyList<DoctorScheduleTemplate> scheduleTemplates)
    {
        // Only opted-in active Doctor and Nurse clinicians may ever appear in the public directory.
        var eligibleClinicians = staffMembers
            .Where(s => s.IsActive
                        && !s.IsDeleted
                        && s.IsDirectoryOptIn
                        && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse)
                        && !string.IsNullOrWhiteSpace(s.PrcLicenseNumber))
            .OrderBy(s => s.LastName)
            .ThenBy(s => s.FirstName)
            .ToList();

        var providerDtos = eligibleClinicians.Select((d, idx) => new FacilityProviderDto(
            Id: d.Id,
            Name: FormatProviderName(d),
            Specialty: ResolveSpecialty(d),
            ProfessionalLicenseNo: d.PrcLicenseNumber,
            IsActive: true,
            DisplayOrder: idx,
            Role: d.Role == StaffRole.Nurse ? "Nurse" : "Doctor",
            CanonicalProviderId: d.CanonicalProviderId,
            NormalizedLicenseNo: PractitionerIdentity.NormalizePrc(d.PrcLicenseNumber),
            PrcExpiryDate: d.PrcExpiryDate,
            IsDirectoryOptIn: d.IsDirectoryOptIn,
            VerificationStatus: d.PublicVerificationStatus,
            FirstName: d.FirstName,
            LastName: d.LastName,
            Bio: d.PublicBio,
            AvatarUrl: d.AvatarUrl,
            Availabilities: MapAvailabilities(d.Id, scheduleTemplates)
        )).ToList();

        var serviceDtos = serviceItems
            .Where(s => s.IsActive && !s.IsDeleted)
            .OrderBy(s => s.Name)
            .Select(s => new ClinicServiceDto(
                ServiceId: s.Id,
                Name: s.Name,
                Category: s.Category,
                StandardPrice: s.StandardPrice,
                IsActive: s.IsActive))
            .ToList();

        var isPlatformVerified = settings.PlatformVerificationStatus == PlatformVerificationStatus.Verified;
        var isPublic = settings.IsWorkspaceEligible && settings.IsDirectoryPublished && isPlatformVerified;

        return new FacilityCreatedEvent
        {
            TenantId = settings.TenantId,
            TenantSlug = settings.TenantSlug,
            FacilityType = FacilityType.Clinic,
            ResourceId = settings.ClinicId,
            Name = settings.ClinicName,
            Slug = settings.FacilitySlug,
            OperatingHours = settings.OperatingHours,
            Address = settings.LetterheadAddress,
            ContactNumber = settings.LetterheadContact,
            Classification = MapClassification(settings.SpecialtyMode),
            IsPhilHealthAccredited = settings.IsPhilHealthConfigured,
            IsDirectoryPublished = settings.IsDirectoryPublished,
            IsWorkspaceEligible = settings.IsWorkspaceEligible,
            IsPlatformVerified = isPlatformVerified,
            PlatformVerificationStatus = settings.PlatformVerificationStatus,
            VerificationRejectionReason = settings.VerificationRejectionReason,
            DirectorySource = DirectorySourceKind.ClinicSelfPublish,
            ReplaceProvidersSnapshot = true,
            IsPublic = isPublic,
            IsBookingPaused = settings.IsOnlineBookingPaused,
            IsJoinGated = settings.IsJoinEnabled && !string.IsNullOrWhiteSpace(settings.JoinCode),
            JoinCode = settings.JoinCode,
            Providers = providerDtos,
            Services = serviceDtos
        };
    }

    public static FacilityVerificationRequestedPayload BuildVerificationRequestedPayload(
        FacilitySettings settings,
        IReadOnlyList<StaffMember> staffMembers,
        IReadOnlyList<ServiceItem> serviceItems,
        IReadOnlyList<DoctorScheduleTemplate> scheduleTemplates,
        string requestKind,
        string? submittedByClinicUserId,
        string? submittedByDisplayName,
        DateTime submittedAtUtc)
    {
        var optedInClinicians = staffMembers
            .Where(s => s.IsActive
                        && !s.IsDeleted
                        && s.IsDirectoryOptIn
                        && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse)
                        && PractitionerIdentity.IsValidPrcFormat(s.PrcLicenseNumber))
            .OrderBy(s => s.LastName)
            .ThenBy(s => s.FirstName)
            .ToList();

        var practitioners = optedInClinicians.Select(s => new BundledPractitionerSubmissionDto
        {
            ClinicStaffMemberId = s.Id,
            ProfessionKind = s.Role == StaffRole.Nurse ? "Nurse" : "Doctor",
            FirstName = s.FirstName,
            LastName = s.LastName,
            Title = s.Title,
            SubmittedPrcLicenseNo = s.PrcLicenseNumber ?? string.Empty,
            NormalizedPrcLicenseNo = PractitionerIdentity.NormalizePrc(s.PrcLicenseNumber) ?? string.Empty,
            PrcExpiryDate = s.PrcExpiryDate,
            PrcEvidenceObjectKey = s.PrcEvidenceObjectKey,
            VerificationContact = s.VerificationContact,
            Specialty = ResolveSpecialty(s),
            PublicBio = s.PublicBio,
            AvatarUrl = s.AvatarUrl,
            Availabilities = MapAvailabilities(s.Id, scheduleTemplates)
        }).ToList();

        var serviceDtos = serviceItems
            .Where(s => s.IsActive && !s.IsDeleted)
            .OrderBy(s => s.Name)
            .Select(s => new ClinicServiceDto(
                ServiceId: s.Id,
                Name: s.Name,
                Category: s.Category,
                StandardPrice: s.StandardPrice,
                IsActive: s.IsActive))
            .ToList();

        return new FacilityVerificationRequestedPayload
        {
            RequestId = Guid.NewGuid(),
            TenantId = settings.TenantId,
            FacilityId = settings.ClinicId,
            FacilityName = settings.ClinicName,
            FacilitySlug = settings.FacilitySlug,
            Classification = MapClassification(settings.SpecialtyMode),
            DohLtoNumber = settings.LetterheadDohLto,
            LtoEvidenceObjectKey = settings.LtoEvidenceObjectKey,
            Address = settings.LetterheadAddress,
            ContactNumber = settings.LetterheadContact,
            ContactEmail = null,
            OperatingHours = settings.OperatingHours,
            IsOnlineBookingPaused = settings.IsOnlineBookingPaused,
            RequestKind = requestKind,
            SubmittedByClinicUserId = submittedByClinicUserId,
            SubmittedByDisplayName = submittedByDisplayName,
            SubmittedAtUtc = submittedAtUtc,
            Services = serviceDtos,
            Practitioners = practitioners
        };
    }

    public static PractitionerVerificationRequestedPayload BuildPractitionerVerificationPayload(
        FacilitySettings? settings,
        StaffMember staff,
        IReadOnlyList<DoctorScheduleTemplate> scheduleTemplates,
        string requestKind,
        string? submittedByClinicUserId,
        DateTime submittedAtUtc)
    {
        var professionKind = PractitionerIdentity.NormalizeProfessionKind(staff.Role.ToString())
            ?? throw new InvalidOperationException("Only Doctor and Nurse roles may submit practitioner verification.");
        var normalizedPrc = PractitionerIdentity.NormalizePrc(staff.PrcLicenseNumber)
            ?? throw new InvalidOperationException("A valid PRC license number is required.");

        return new PractitionerVerificationRequestedPayload
        {
            RequestId = Guid.NewGuid(),
            TenantId = staff.TenantId,
            FacilityId = staff.ClinicId,
            FacilityName = settings?.ClinicName ?? "Clinic Facility",
            ClinicStaffMemberId = staff.Id,
            RequestKind = requestKind,
            ProfessionKind = professionKind,
            FirstName = staff.FirstName,
            LastName = staff.LastName,
            Title = staff.Title,
            SubmittedPrcLicenseNo = staff.PrcLicenseNumber ?? string.Empty,
            NormalizedPrcLicenseNo = normalizedPrc,
            PrcExpiryDate = staff.PrcExpiryDate,
            PrcEvidenceObjectKey = staff.PrcEvidenceObjectKey,
            VerificationContact = staff.VerificationContact,
            Specialty = ResolveSpecialty(staff),
            PublicBio = staff.PublicBio,
            AvatarUrl = staff.AvatarUrl,
            Availabilities = MapAvailabilities(staff.Id, scheduleTemplates),
            SubmittedByClinicUserId = submittedByClinicUserId,
            SubmittedAtUtc = submittedAtUtc
        };
    }
}
