namespace ClinicEz.Patient.Application.Features.Sharing;

public sealed record ShareTokenDto(
    string Token,
    DateTime ExpiresAt,
    int TtlSeconds,
    string ClinicEzId,
    IReadOnlyList<string> Scopes,
    string Purpose);

public sealed record AccessGrantDto(
    Guid Id,
    string TenantId,
    Guid FacilityId,
    string? FacilityName,
    IReadOnlyList<string> Scopes,
    string Purpose,
    string Source,
    string Status,
    DateTime ExpiresAt,
    DateTime? RevokedAt,
    DateTime CreatedAt);

public sealed record AccessLogDto(
    Guid Id,
    Guid GrantId,
    string? FacilityName,
    string Actor,
    string Action,
    string? Detail,
    DateTime At);

public sealed record AccessLogPageDto(IReadOnlyList<AccessLogDto> Items, int TotalCount);