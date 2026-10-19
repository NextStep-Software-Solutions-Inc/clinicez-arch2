using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Licensing;

public class LicenseIssuerAndPublisherTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant = new() { Id = Guid.NewGuid(), TenantSlug = "metro", Name = "Metro", OwnerId = "owner", Email = "o@metro.ph" };
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 3, 1, 8, 0, 0, TimeSpan.Zero));
    private readonly LicenseOptions _options = new() { TtlDays = 30, GraceDays = 14 };

    public LicenseIssuerAndPublisherTests()
    {
        _context.Tenants.Add(_tenant);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private DateTime Now => _clock.GetUtcNow().UtcDateTime;

    private LicenseIssuer Issuer() => new(new FacilityLicenseSigner(), Options.Create(_options), _clock);

    private async Task<EntitlementSnapshot> SnapshotAsync(string plan, SubscriptionStatus status = SubscriptionStatus.Active, DateTime? periodEnd = null)
    {
        await TestSupport.SeedSubscriptionAsync(_context, _tenant.Id, status, plan, periodEnd ?? Now.AddDays(60));
        return await TestSupport.Entitlements(_context, _clock).ResolveAsync(_tenant.Id, CancellationToken.None);
    }

    private Facility NewFacility(FacilityStatus status = FacilityStatus.Active, FacilityType type = FacilityType.Clinic) =>
        new() { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Site", FacilityType = type, Status = status, CreatedAt = Now };

    [Fact]
    public async Task Issue_DerivesLimitsFeaturesAndVersionFromTheEntitlements_AndTheShareFromThePool()
    {
        var snapshot = await SnapshotAsync("pro");
        var facility = NewFacility();

        var license = Issuer().Issue(_tenant, facility, snapshot, new FacilityShare(7, 512, 2));

        var payload = license.Payload;
        Assert.Equal(facility.Id, payload.FacilityId);
        Assert.Equal(_tenant.Id.ToString(), payload.TenantId);
        Assert.Equal("pro", payload.PlanTier);
        Assert.Equal(7, payload.Limits.MaxStaff);
        Assert.Equal(512, payload.Limits.MaxStorageMb);
        Assert.Equal(2, payload.Limits.ConcurrentTerminals);
        Assert.Equal(snapshot.Version, payload.EntitlementVersion);
        Assert.Equal("Active", payload.WorkspaceStatus);
        Assert.Equal(_tenant.Id, payload.PoolId);
        Assert.Contains(FacilityFeatureKeys.Teleconsultation, payload.EnabledFeatures);
        Assert.False(string.IsNullOrWhiteSpace(license.Token));
    }

    [Fact]
    public async Task Issue_OnlyEmbedsTheFeaturesThePlanGrants()
    {
        var snapshot = await SnapshotAsync("starter");

        var payload = Issuer().Issue(_tenant, NewFacility(), snapshot, new FacilityShare(10, 2048, 3)).Payload;

        Assert.Equal([FacilityFeatureKeys.ElectronicPrescriptions], payload.EnabledFeatures);
    }

    [Fact]
    public async Task Issue_ExpiresAfterTheConfiguredTtl_WithTheGraceWindowOnTop()
    {
        var snapshot = await SnapshotAsync("pro");

        var payload = Issuer().Issue(_tenant, NewFacility(), snapshot, new FacilityShare(1, 1, 1)).Payload;

        Assert.Equal(Now, payload.IssuedAtUtc);
        Assert.Equal(Now.AddDays(30), payload.ExpiresAtUtc);
        Assert.Equal(14, payload.GraceDays);
        Assert.Equal(Now.AddDays(44), payload.ReadOnlyGraceUntil);
    }

    [Theory]
    [InlineData(5, 30)]
    [InlineData(500, 90)]
    public async Task Issue_ClampsTheTtlToTheSupportedRange(int configured, int expectedDays)
    {
        _options.TtlDays = configured;
        var snapshot = await SnapshotAsync("pro");

        var payload = Issuer().Issue(_tenant, NewFacility(), snapshot, new FacilityShare(1, 1, 1)).Payload;

        Assert.Equal(Now.AddDays(expectedDays), payload.ExpiresAtUtc);
    }

    [Fact]
    public async Task Issue_ForACancelledWorkspace_NeverOutlivesThePaidPeriod()
    {
        var periodEnd = Now.AddDays(9);
        var snapshot = await SnapshotAsync("pro", SubscriptionStatus.Cancelled, periodEnd);

        var payload = Issuer().Issue(_tenant, NewFacility(), snapshot, new FacilityShare(1, 1, 1)).Payload;

        Assert.Equal(periodEnd, payload.ExpiresAtUtc);
        Assert.Equal("Cancelled", payload.WorkspaceStatus);
        Assert.Equal(periodEnd.AddDays(14), payload.ReadOnlyGraceUntil);
    }

    [Fact]
    public async Task Issue_ForAnActiveWorkspace_IsNotCappedByItsPeriodEnd()
    {
        var snapshot = await SnapshotAsync("pro", SubscriptionStatus.Active, Now.AddDays(5));

        var payload = Issuer().Issue(_tenant, NewFacility(), snapshot, new FacilityShare(1, 1, 1)).Payload;

        Assert.Equal(Now.AddDays(30), payload.ExpiresAtUtc);
    }

    [Fact]
    public async Task Issue_ForAnExpiredWorkspace_CarriesNoFeaturesAndExpiresAtTheEndOfWhatWasPaid()
    {
        var periodEnd = Now.AddDays(-10);
        var snapshot = await SnapshotAsync("pro", SubscriptionStatus.Active, periodEnd);

        var payload = Issuer().Issue(_tenant, NewFacility(), snapshot, new FacilityShare(0, 0, 0)).Payload;

        Assert.Equal("Expired", payload.WorkspaceStatus);
        Assert.Empty(payload.EnabledFeatures);
        Assert.Equal(periodEnd, payload.ExpiresAtUtc);
    }

    [Fact]
    public async Task Issue_SignsTokensTheSharedValidatorAccepts_AndRejectsTamperingOrAnotherFacility()
    {
        var snapshot = await SnapshotAsync("pro");
        var facility = NewFacility();
        var license = new LicenseIssuer(new FacilityLicenseSigner(), Options.Create(_options), TimeProvider.System)
            .Issue(_tenant, facility, snapshot, new FacilityShare(1, 1, 1));
        var validator = new FacilityLicenseValidator();

        var valid = validator.Validate(license.Token, facility.Id, _tenant.Id.ToString());
        var wrongFacility = validator.Validate(license.Token, Guid.NewGuid(), _tenant.Id.ToString());

        Assert.True(valid.IsValid, valid.ErrorMessage);
        Assert.False(wrongFacility.IsValid);
        Assert.False(validator.Validate(license.Token + "x", facility.Id, _tenant.Id.ToString()).IsValid);
    }

    [Fact]
    public async Task Publisher_StagesEntitlementsChangedForEveryRoutableFacility_AndRefreshesTheirLicenses()
    {
        var snapshot = await SnapshotAsync("pro");
        var clinic = NewFacility(FacilityStatus.Active, FacilityType.Clinic);
        var lab = NewFacility(FacilityStatus.Provisioning, FacilityType.Laboratory);
        var suspended = NewFacility(FacilityStatus.Suspended, FacilityType.Pharmacy);
        _context.Facilities.AddRange(clinic, lab, suspended);
        await _context.SaveChangesAsync();

        await Publisher().StageForWorkspaceAsync(_tenant.Id, CancellationToken.None);
        await _context.SaveChangesAsync();

        var all = TestSupport.Outbox(_context, InteropTypes.EntitlementsChanged);
        var messages = all.Where(m => m.To.Service is null).ToList();
        Assert.Equal(2, messages.Count);
        Assert.Equivalent(
            new[] { clinic.Id, lab.Id },
            messages.Select(m => m.GetPayload<EntitlementsChangedEvent>().FacilityId));
        Assert.All(messages, m => Assert.Equal(Party.Portal, m.From));

        var clinicMessage = messages.Single(m => m.GetPayload<EntitlementsChangedEvent>().FacilityId == clinic.Id);
        var payload = clinicMessage.GetPayload<EntitlementsChangedEvent>();
        Assert.Equal(Party.ForFacility(_tenant.Id.ToString(), clinic.Id.ToString(), FacilityType.Clinic), clinicMessage.To);
        Assert.Equal(snapshot.Version, payload.EntitlementVersion);
        Assert.Equal("Active", payload.WorkspaceStatus);
        Assert.Equal("pro", payload.PlanSlug);
        Assert.Equal(Now.AddDays(30), payload.LicenseExpiresAtUtc);
        Assert.Equal(Now.AddDays(44), payload.ReadOnlyGraceUntilUtc);

        // The billing service of each facility's cell gets the identical message from its own mailbox.
        var billing = all.Where(m => m.To.Service == InteropServices.Billing).ToList();
        Assert.Equal(2, billing.Count);
        var clinicBilling = billing.Single(m => m.GetPayload<EntitlementsChangedEvent>().FacilityId == clinic.Id);
        Assert.Equal(clinicMessage.To with { Service = InteropServices.Billing }, clinicBilling.To);
        Assert.Equal(clinicMessage.CorrelationId, clinicBilling.CorrelationId);
        var billingPayload = clinicBilling.GetPayload<EntitlementsChangedEvent>();
        Assert.Equal(payload.LicenseToken, billingPayload.LicenseToken);
        Assert.Equal(payload.EntitlementVersion, billingPayload.EntitlementVersion);
        Assert.Equal(payload.MaxStaff, billingPayload.MaxStaff);
        Assert.Equal(payload.EnabledFeatures, billingPayload.EnabledFeatures);

        var stored = await _context.Facilities.AsNoTracking().SingleAsync(f => f.Id == clinic.Id);
        Assert.Equal(payload.LicenseToken, stored.LicenseToken);
        Assert.Equal(payload.MaxStaff, stored.MaxStaffLimit);
        Assert.Equal("pro", stored.PlanTier);
        Assert.Null((await _context.Facilities.AsNoTracking().SingleAsync(f => f.Id == suspended.Id)).LicenseToken);
    }

    [Fact]
    public async Task Publisher_SharesAddUpToThePoolAcrossTheFacilities()
    {
        await SnapshotAsync("starter");
        _context.Facilities.AddRange(NewFacility(), NewFacility(), NewFacility());
        await _context.SaveChangesAsync();

        await Publisher().StageForWorkspaceAsync(_tenant.Id, CancellationToken.None);
        await _context.SaveChangesAsync();

        var total = TestSupport.Outbox(_context, InteropTypes.EntitlementsChanged)
            .Where(m => m.To.Service is null)
            .Sum(m => m.GetPayload<EntitlementsChangedEvent>().MaxStaff);
        Assert.Equal(10, total);
    }

    [Fact]
    public async Task Publisher_ForAWorkspaceWithoutRoutableFacilities_StagesNothing()
    {
        await SnapshotAsync("pro");
        _context.Facilities.Add(NewFacility(FacilityStatus.Failed));
        await _context.SaveChangesAsync();

        await Publisher().StageForWorkspaceAsync(_tenant.Id, CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.Empty(TestSupport.Outbox(_context, InteropTypes.EntitlementsChanged));
    }

    [Fact]
    public async Task Publisher_ForAnUnknownWorkspace_StagesNothing()
    {
        await Publisher().StageForWorkspaceAsync(Guid.NewGuid(), CancellationToken.None);

        Assert.Empty(TestSupport.Outbox(_context));
    }

    private EntitlementsPublisher Publisher() =>
        new(
            _context,
            TestSupport.Entitlements(_context, _clock),
            new FacilityAllocationService(_context),
            Issuer(),
            new InteropPublisher(_context));
}
