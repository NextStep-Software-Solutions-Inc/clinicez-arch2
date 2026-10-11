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
        SharingScopeMap.ToNames((SharingScopes)(int)grant.Scopes),
        grant.Purpose,
        grant.Source.ToString(),
        StatusOf(grant, utcNow),
        grant.ExpiresAt,
        grant.RevokedAt,
        grant.CreatedAt);

    public static string StatusOf(PatientAccessGrant grant, DateTime utcNow) =>
        (grant.RevokedAt is not null ? AccessGrantStatus.Revoked : grant.ExpiresAt <= utcNow ? AccessGrantStatus.Expired : AccessGrantStatus.Active).ToString();
}