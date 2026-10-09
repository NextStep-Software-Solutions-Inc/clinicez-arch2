using System.Text.Json;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Patient.Application.Features.Sharing;

public static class AccessGrantMapper
{
    public static AccessGrantDto ToDto(PatientAccessGrant grant, string? facilityName, DateTime utcNow) => new(
        grant.Id,
        grant.TenantId,
        grant.FacilityId,
        facilityName,
        SharingScopeMap.ToNames((SharingScopes)grant.ScopesMask),
        grant.Purpose,
        JsonNamingPolicy.CamelCase.ConvertName(grant.Source.ToString()),
        StatusOf(grant, utcNow),
        grant.ExpiresAt,
        grant.RevokedAt,
        grant.CreatedAt);

    public static string StatusOf(PatientAccessGrant grant, DateTime utcNow) =>
        grant.RevokedAt is not null ? "revoked" : grant.ExpiresAt <= utcNow ? "expired" : "active";
}