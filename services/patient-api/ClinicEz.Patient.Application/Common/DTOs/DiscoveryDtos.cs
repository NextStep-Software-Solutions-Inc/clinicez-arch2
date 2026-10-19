namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record OrganizationSummaryDto(
    Guid Id,
    string Slug,
    string Name,
    string Description,
    bool IsPublic,
    string? LogoUrl,
    string? CoverImageUrl,
    string? AddressHint,
    int FeaturedScore,
    int ActiveMemberCount,
    string RequiredShareFieldsJson,
    string RolesJson,
    string? MembershipStatus = null);

public sealed record OrganizationRoleDto(
    Guid Id,
    Guid OrganizationId,
    string RoleId,
    string Name,
    string Description);

public sealed record OrganizationDetailDto(
    Guid Id,
    string Slug,
    string Name,
    string Description,
    bool IsPublic,
    string? LogoUrl,
    string? CoverImageUrl,
    string? AddressHint,
    string? PrivacyPolicyUrl,
    string? TermsAndConditionsUrl,
    string RequiredShareFieldsJson,
    string RolesJson,
    int FeaturedScore,
    int ActiveMemberCount,
    IReadOnlyList<ClinicSummaryDto> LinkedClinics);

public sealed record ClinicSummaryDto(
    Guid Id,
    string Name,
    string? Description,
    string? Address,
    bool IsPublic,
    bool SupportsAppointments,
    string? LogoUrl,
    string? CoverImageUrl,
    string SpecialtiesJson,
    string RequiredShareFieldsJson,
    int FeaturedScore,
    int ActiveMemberCount,
    string? MembershipStatus = null,
    bool IsGated = false,
    bool IsUnlocked = true);

public sealed record ClinicHealthcareProviderDto(
    Guid Id,
    string Name,
    string Specialty,
    string? AvatarUrl,
    string? ProfessionalLicenseNo);

public sealed record ClinicServiceDto(
    Guid Id,
    string Name,
    string? Description,
    int? DurationMinutes,
    decimal? Price);

public sealed record ClinicDetailDto(
    Guid Id,
    string Name,
    string? Description,
    string? Address,
    bool IsPublic,
    bool SupportsAppointments,
    string? LogoUrl,
    string? CoverImageUrl,
    string? PrivacyPolicyUrl,
    string? TermsAndConditionsUrl,
    string SpecialtiesJson,
    string RequiredShareFieldsJson,
    int FeaturedScore,
    int ActiveMemberCount,
    IReadOnlyList<ClinicHealthcareProviderDto> HealthcareProviders,
    IReadOnlyList<ClinicServiceDto> Services,
    IReadOnlyList<OrganizationSummaryDto> LinkedOrganizations,
    string? MembershipStatus,
    bool IsGated = false,
    bool IsUnlocked = true);

public sealed record DiscoveryPagedDto<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Skip,
    int Take);
