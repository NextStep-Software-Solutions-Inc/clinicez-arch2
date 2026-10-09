using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Licensing;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Application.Features.Licensing;

/// <summary>A facility's slice of the workspace pools (staff, storage, terminals).</summary>
public sealed record FacilityShare(int MaxStaff, int MaxStorageMb, int ConcurrentTerminals);

public sealed record IssuedLicense(string Token, FacilityLicensePayload Payload);

/// <summary>Derives a short, renewable, signed facility license from the workspace's entitlements and the facility's pool share.</summary>
public interface ILicenseIssuer
{
    IssuedLicense Issue(Tenant tenant, Facility facility, EntitlementSnapshot snapshot, FacilityShare share);
}

public sealed class LicenseIssuer(
    IFacilityLicenseSigner signer,
    IOptions<LicenseOptions> options,
    TimeProvider timeProvider) : ILicenseIssuer
{
    public IssuedLicense Issue(Tenant tenant, Facility facility, EntitlementSnapshot snapshot, FacilityShare share)
    {
        var config = options.Value;
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var expiresAt = now.AddDays(config.EffectiveTtlDays);
        // A cancelled or lapsed workspace never gets a license that outlives what it paid for.
        if (snapshot.Status is SubscriptionStatus.Cancelled or SubscriptionStatus.Expired && snapshot.PeriodEnd is { } periodEnd && periodEnd < expiresAt)
        {
            expiresAt = periodEnd;
        }

        var payload = new FacilityLicensePayload
        {
            FacilityId = facility.Id,
            TenantId = tenant.Id.ToString(),
            TenantSlug = tenant.TenantSlug,
            FacilityName = facility.Name,
            FacilityType = facility.FacilityType.ToString(),
            OwnerEmail = string.IsNullOrWhiteSpace(facility.ContactEmail) ? null : facility.ContactEmail.Trim(),
            PlanTier = snapshot.PlanSlug,
            Limits = new FacilityLimits
            {
                MaxStaff = share.MaxStaff,
                MaxStorageMb = share.MaxStorageMb,
                ConcurrentTerminals = share.ConcurrentTerminals,
                MaxBeds = snapshot.LimitAsInt(EntitlementKeys.LimitBeds),
                MaxAnalyzers = snapshot.LimitAsInt(EntitlementKeys.LimitAnalyzers),
                MaxMonthlyConsultations = snapshot.LimitAsInt(EntitlementKeys.LimitMonthlyConsultations)
            },
            EnabledFeatures = EntitlementKeys.FacilityLicenseFeatures
                .Where(map => snapshot.Has(map.Key))
                .Select(map => map.Value)
                .ToList(),
            IssuedAtUtc = now,
            ExpiresAtUtc = expiresAt,
            EntitlementVersion = snapshot.Version,
            WorkspaceStatus = snapshot.Status.ToString(),
            GraceDays = config.GraceDays,
            ReadOnlyGraceUntil = expiresAt.AddDays(config.GraceDays),
            BranchId = facility.BranchId,
            PoolId = tenant.Id
        };

        return new IssuedLicense(signer.SignLicense(payload), payload);
    }
}
