namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record UnifiedSearchResultDto(
    IReadOnlyList<UnifiedDoctorDto> Doctors,
    IReadOnlyList<UnifiedClinicDto> Clinics,
    IReadOnlyList<UnifiedServiceDto> Services);

public sealed record UnifiedDoctorDto(
    Guid Id,
    string FullName,
    string Specialty,
    string ClinicName,
    string Distance,
    decimal Rating,
    int ReviewsCount,
    string NextAvailableSlot,
    IReadOnlyList<string> Tags);

public sealed record UnifiedClinicDto(
    Guid Id,
    string Name,
    string? Address,
    string Distance,
    bool IsOpenNow,
    string OpenText,
    decimal Rating,
    int ReviewsCount,
    IReadOnlyList<string> Tags);

public sealed record UnifiedServiceDto(
    Guid Id,
    string Name,
    string? Description,
    int? DurationMinutes,
    bool IsCovered,
    IReadOnlyList<string> Tags);
