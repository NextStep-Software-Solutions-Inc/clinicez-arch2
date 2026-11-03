namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record PatientSearchCountsDto(
    int All,
    int Doctors,
    int Clinics,
    int Services);

public sealed record PatientSearchDoctorDto(
    Guid Id,
    Guid ClinicId,
    string Name,
    string Specialty,
    string? AvatarUrl,
    string? ProfessionalLicenseNo,
    bool IsVerified,
    string ClinicName,
    string? ClinicAddress,
    bool ClinicSupportsAppointments,
    DateTime? NextAvailableAt,
    string NextAvailableLabel,
    IReadOnlyList<string> Tags);

public sealed record PatientSearchClinicDto(
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
    IReadOnlyList<string> Tags);

public sealed record PatientSearchServiceDto(
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

public sealed record PatientSearchResponseDto(
    string Query,
    string Category,
    PatientSearchCountsDto Counts,
    IReadOnlyList<PatientSearchDoctorDto> Doctors,
    IReadOnlyList<PatientSearchClinicDto> Clinics,
    IReadOnlyList<PatientSearchServiceDto> Services);
