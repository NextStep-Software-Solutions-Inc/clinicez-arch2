namespace PatientApp.Application.Common.DTOs;

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
    string RolesJson);

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
    int FeaturedScore);

public sealed record ClinicDetailDto(
    Guid Id,
    string Name,
    string? Description,
    string? Address,
    bool IsPublic,
    bool SupportsAppointments,
    string BaseUrl,
    string? LogoUrl,
    string? CoverImageUrl,
    string? PrivacyPolicyUrl,
    string? TermsAndConditionsUrl,
    string SpecialtiesJson,
    string RequiredShareFieldsJson,
    int FeaturedScore,
    IReadOnlyList<OrganizationSummaryDto> LinkedOrganizations,
    string? MembershipStatus);

public sealed record DiscoveryPagedDto<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Skip,
    int Take);
