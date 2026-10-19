using System;
using System.Collections.Generic;
using ClinicEz.Shared.Licensing;
using Xunit;

namespace ClinicEz.Portal.Tests;

public class FacilityLicenseTests
{
    private readonly FacilityLicenseSigner _signer = new();
    private readonly FacilityLicenseValidator _validator = new();

    [Fact]
    public void SignAndValidate_WithValidPayload_ShouldSucceed()
    {
        var facilityId = Guid.NewGuid();
        var tenantId = "tenant-st-luke";

        var payload = new FacilityLicensePayload
        {
            FacilityId = facilityId,
            TenantId = tenantId,
            FacilityName = "St. Luke's Medical Clinic",
            FacilityType = "Clinic",
            PlanTier = "Standard",
            Limits = new FacilityLimits
            {
                MaxStaff = 15,
                MaxBeds = 20,
                MaxAnalyzers = 3,
                MaxMonthlyConsultations = 2500,
                MaxStorageMb = 20480,
                ConcurrentTerminals = 5
            },
            EnabledFeatures = new List<string>
            {
                FacilityFeatureKeys.Teleconsultation,
                FacilityFeatureKeys.ElectronicPrescriptions,
                FacilityFeatureKeys.PhilHealthKonsulta
            },
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        };

        var token = _signer.SignLicense(payload);
        Assert.NotNull(token);
        Assert.Contains(".", token);

        var result = _validator.Validate(token, facilityId, tenantId);

        Assert.True(result.IsValid);
        Assert.False(result.IsTampered);
        Assert.False(result.IsExpired);
        Assert.False(result.IsMissing);
        Assert.NotNull(result.Payload);
        Assert.Equal(15, result.Payload.Limits.MaxStaff);
        Assert.Equal(20, result.Payload.Limits.MaxBeds);
        Assert.Equal(3, result.Payload.Limits.MaxAnalyzers);
        Assert.Equal(2500, result.Payload.Limits.MaxMonthlyConsultations);
        Assert.Equal(20480, result.Payload.Limits.MaxStorageMb);
        Assert.Equal(5, result.Payload.Limits.ConcurrentTerminals);
        Assert.Contains(FacilityFeatureKeys.Teleconsultation, result.Payload.EnabledFeatures);
    }

    [Fact]
    public void Validate_WhenPayloadTampered_ShouldDetectTamperingAndFail()
    {
        var facilityId = Guid.NewGuid();
        var tenantId = "tenant-001";

        var payload = new FacilityLicensePayload
        {
            FacilityId = facilityId,
            TenantId = tenantId,
            FacilityName = "Tamper Test Clinic",
            Limits = new FacilityLimits { MaxStaff = 3 }
        };

        var token = _signer.SignLicense(payload);
        var parts = token.Split('.');

        // Tamper with payload: change MaxStaff to 9999
        var decodedJson = System.Text.Encoding.UTF8.GetString(Base64UrlHelper.Decode(parts[0]));
        var tamperedJson = decodedJson.Replace("\"maxStaff\":3", "\"maxStaff\":9999");
        var tamperedPayloadPart = Base64UrlHelper.Encode(System.Text.Encoding.UTF8.GetBytes(tamperedJson));
        var tamperedToken = $"{tamperedPayloadPart}.{parts[1]}";

        var result = _validator.Validate(tamperedToken, facilityId, tenantId);

        Assert.False(result.IsValid);
        Assert.True(result.IsTampered);
        Assert.Contains("tampered", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_WhenFacilityIdMismatches_ShouldFailValidation()
    {
        var facilityIdA = Guid.NewGuid();
        var facilityIdB = Guid.NewGuid();
        var tenantId = "tenant-001";

        var payload = new FacilityLicensePayload
        {
            FacilityId = facilityIdA,
            TenantId = tenantId,
            FacilityName = "Clinic A",
            Limits = new FacilityLimits { MaxStaff = 5 }
        };

        var token = _signer.SignLicense(payload);

        // Attempt to apply token issued for Clinic A to Clinic B
        var result = _validator.Validate(token, facilityIdB, tenantId);

        Assert.False(result.IsValid);
        Assert.True(result.IsTampered);
        Assert.Contains("facility binding mismatch", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_WhenExpired_ShouldFlagAsExpired()
    {
        var facilityId = Guid.NewGuid();
        var tenantId = "tenant-001";

        var payload = new FacilityLicensePayload
        {
            FacilityId = facilityId,
            TenantId = tenantId,
            FacilityName = "Expired Clinic",
            ExpiresAtUtc = DateTime.UtcNow.AddDays(-10) // Expired 10 days ago
        };

        var token = _signer.SignLicense(payload);
        var result = _validator.Validate(token, facilityId, tenantId);

        Assert.False(result.IsValid);
        Assert.True(result.IsExpired);
        Assert.Contains("expired", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_WhenTokenMissing_ShouldReturnIsMissing()
    {
        var facilityId = Guid.NewGuid();

        var resultNull = _validator.Validate(null, facilityId);
        var resultEmpty = _validator.Validate("   ", facilityId);

        Assert.False(resultNull.IsValid);
        Assert.True(resultNull.IsMissing);

        Assert.False(resultEmpty.IsValid);
        Assert.True(resultEmpty.IsMissing);
    }

    [Fact]
    public void Validate_WhenExpectedTenantIdMatchesTenantSlug_ShouldSucceed()
    {
        var facilityId = Guid.NewGuid();
        var tenantGuid = Guid.NewGuid().ToString();
        var tenantSlug = "apex-health-center";

        var payload = new FacilityLicensePayload
        {
            FacilityId = facilityId,
            TenantId = tenantGuid,
            TenantSlug = tenantSlug,
            FacilityName = "Apex Health Facility",
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        };

        var token = _signer.SignLicense(payload);

        // Validation with expectedTenantId = slug should succeed even though payload.TenantId is a GUID
        var result = _validator.Validate(token, facilityId, tenantSlug);

        Assert.True(result.IsValid);
        Assert.False(result.IsTampered);
        Assert.NotNull(result.Payload);
        Assert.Equal(tenantSlug, result.Payload.TenantSlug);
    }
}
