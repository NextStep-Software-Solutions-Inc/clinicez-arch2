using ClinicEz.Shared.Common;

namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record DirectorySearchCountsDto(
    int All,
    int Doctors,
    int Clinics,
    int Services);

public sealed record DirectoryDoctorAffiliationDto(
    Guid ClinicId,
    string ClinicName,
    string? ClinicAddress,
    bool SupportsAppointments,
    string LocalSpecialty,
    DateTime? NextAvailableAt,
    string NextAvailableLabel,
    IReadOnlyList<ProviderAvailabilityWindowDto> Availabilities,
    Guid ProviderId = default);

public sealed record DirectoryDoctorDto(
    Guid Id,
    Guid? PractitionerId,
    Guid ClinicId,
    string Name,
    string Specialty,
    string Role,
    string? AvatarUrl,
    string? ProfessionalLicenseNo,
    bool IsVerified,
    string ClinicName,
    string? ClinicAddress,
    bool ClinicSupportsAppointments,
    DateTime? NextAvailableAt,
    string NextAvailableLabel,
    IReadOnlyList<string> Tags,
    string? Bio = null,
    IReadOnlyList<DirectoryDoctorAffiliationDto>? Affiliations = null);

public sealed record DirectoryClinicDto(
    Guid Id,
    string Name,
    string? PrimarySpecialty,
    string? Description,
    string? Address,
    string? LogoUrl,
    string? CoverImageUrl,
    string? OperatingHours,
    string OpenStatusLabel,
    bool IsOpenNow,
    bool SupportsAppointments,
    bool IsPublic,
    bool IsGated,
    bool IsUnlocked,
    int ActiveMemberCount,
    DateTime? NextAvailableAt,
    string? NextAvailableLabel,
    IReadOnlyList<string> Tags,
    bool IsPlatformVerified = false);

public sealed record DirectoryServiceDto(
    Guid Id,
    Guid ClinicId,
    string ClinicName,
    string Name,
    string? Subtitle,
    string? Description,
    int? DurationMinutes,
    decimal? Price,
    string PriceBadgeLabel,
    IReadOnlyList<string> Tags);

public sealed record DirectorySearchResponseDto(
    string Query,
    string Category,
    DirectorySearchCountsDto Counts,
    IReadOnlyList<DirectoryDoctorDto> Doctors,
    IReadOnlyList<DirectoryClinicDto> Clinics,
    IReadOnlyList<DirectoryServiceDto> Services);

public sealed record PractitionerProfileDto(
    Guid Id,
    Guid? PractitionerId,
    string Name,
    string FirstName,
    string LastName,
    string Role,
    string PrimarySpecialty,
    string? Bio,
    string? AvatarUrl,
    string? DisplayPrcLicenseNo,
    DateOnly? PrcExpiryDate,
    PractitionerVerificationLevel VerificationLevel,
    bool IsVerified,
    DateTime? VerifiedAtUtc,
    IReadOnlyList<DirectoryDoctorAffiliationDto> Affiliations);
