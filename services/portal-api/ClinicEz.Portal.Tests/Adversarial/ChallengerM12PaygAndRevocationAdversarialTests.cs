using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Guest;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Licensing;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Challenge Suite for Milestone M12:
/// 1. Opt-in PAYG gating in EntitlementService.ResolveAsync (unactivated, prepaid balance < rate vs >= rate, postpaid, SuperAdmin override precedence).
/// 2. Zero-PHI invariant across TeleconsultUsageRecord, MediaUsageRecordedPayload, and PublicGuestTeleconsultEndpoints.cs.
/// 3. Revocation status endpoint: GET /portal/guest/teleconsult/status on revoked tokens returning 410 Gone (GUEST_CONSULTATION_ENDED).
/// </summary>
[Collection("GuestTeleconsultTests")]
public sealed class ChallengerM12PaygAndRevocationAdversarialTests : IDisposable
{
    private readonly ApplicationDbContext _db = TestSupport.NewContext();
    private readonly Mock<IInteropPublisher> _publisherMock = new();
    private readonly IGuestVerificationService _verificationService;

    public ChallengerM12PaygAndRevocationAdversarialTests()
    {
        var configValues = new Dictionary<string, string?>
        {
            ["LiveKit:ApiKey"] = "test-livekit-key",
            ["LiveKit:ApiSecret"] = "test-livekit-secret-32bytes-long-supersecret!",
            ["LiveKit:Url"] = "wss://livekit.clinicez.internal"
        };
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(configValues).Build();

        _verificationService = new GuestVerificationService(
            _publisherMock.Object,
            configuration,
            NullLogger<GuestVerificationService>.Instance);

        GuestVerificationService.ClearStore();
    }

    public void Dispose()
    {
        GuestVerificationService.ClearStore();
        _db.Database.EnsureDeleted();
        _db.Dispose();
    }

    #region 1. Opt-In PAYG Gating in EntitlementService.ResolveAsync

    [Theory]
    [InlineData("community")]
    [InlineData("standard")]
    [InlineData("enterprise")]
    public void OptInPayg_SeededPlanTiers_DoNotContainTeleconsultationByDefault(string planTier)
    {
        var features = PlanTierDefaults.GetFeaturesForTier(planTier);
        var limits = PlanTierDefaults.GetLimitsForTier(planTier);

        Assert.DoesNotContain(FacilityFeatureKeys.Teleconsultation, features);
        Assert.DoesNotContain(EntitlementKeys.FeatureTeleconsultation, features);
        Assert.Equal(0, limits.CallMinutesMonthly);
    }

    [Fact]
    public async Task OptInPayg_UnactivatedWorkspace_WithoutBillingRecord_FeatureTeleconsultationIsFalse()
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "unactivated-corp", Name = "Unactivated Corp" };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, planSlug: "pro");
        var service = TestSupport.Entitlements(_db);

        var snapshot = await service.ResolveAsync(tenant.Id, CancellationToken.None);

        Assert.False(snapshot.Has(EntitlementKeys.FeatureTeleconsultation));
    }

    [Fact]
    public async Task OptInPayg_BillingRecordDisabled_FeatureTeleconsultationIsFalse()
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "disabled-clinic", Name = "Disabled Clinic" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = false, // Explicitly disabled
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, planSlug: "pro");
        var service = TestSupport.Entitlements(_db);

        var snapshot = await service.ResolveAsync(tenant.Id, CancellationToken.None);

        Assert.False(snapshot.Has(EntitlementKeys.FeatureTeleconsultation));
    }

    [Theory]
    [InlineData(0.00, 5.00, false)]      // Zero balance
    [InlineData(4.99, 5.00, false)]      // 1 cent below rate
    [InlineData(5.00, 5.00, true)]       // Exact boundary match
    [InlineData(5.01, 5.00, true)]       // Above rate
    [InlineData(14.99, 15.00, false)]    // Custom rate: 1 cent below
    [InlineData(15.00, 15.00, true)]     // Custom rate: exact match
    [InlineData(100.00, 15.00, true)]    // High balance
    public async Task OptInPayg_Prepaid_BalanceGating_StressTest(double balance, double rate, bool expectedHasFeature)
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = $"prepaid-{Guid.NewGuid():N}", Name = "Prepaid Clinic" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = (decimal)rate,
            PrepaidBalancePhp = (decimal)balance,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, planSlug: "pro");
        var service = TestSupport.Entitlements(_db);

        var snapshot = await service.ResolveAsync(tenant.Id, CancellationToken.None);

        Assert.Equal(expectedHasFeature, snapshot.Has(EntitlementKeys.FeatureTeleconsultation));
    }

    [Theory]
    [InlineData(0.00, 4.99, false)]   // Zero rate falls back to 5.00m default -> 4.99 is insufficient
    [InlineData(0.00, 5.00, true)]    // Zero rate falls back to 5.00m default -> 5.00 is sufficient
    [InlineData(-5.00, 4.99, false)]  // Negative rate falls back to 5.00m default -> 4.99 is insufficient
    [InlineData(-5.00, 5.00, true)]   // Negative rate falls back to 5.00m default -> 5.00 is sufficient
    public async Task OptInPayg_Prepaid_ZeroOrNegativeRate_FallsBackToDefaultFivePhp(double configuredRate, double balance, bool expectedHasFeature)
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = $"rate-fallback-{Guid.NewGuid():N}", Name = "Fallback Clinic" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = (decimal)configuredRate,
            PrepaidBalancePhp = (decimal)balance,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, planSlug: "pro");
        var service = TestSupport.Entitlements(_db);

        var snapshot = await service.ResolveAsync(tenant.Id, CancellationToken.None);

        Assert.Equal(expectedHasFeature, snapshot.Has(EntitlementKeys.FeatureTeleconsultation));
    }

    [Fact]
    public async Task OptInPayg_Postpaid_Enabled_AllowsCallsRegardlessOfBudgetOverage()
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "postpaid-clinic", Name = "Postpaid Clinic" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            AllocatedBudgetPhp = 100m,
            CurrentPeriodBilledPhp = 250m, // Over budget!
            CurrentPeriodOveragePhp = 150m,
            AllowOverageBeyondAllocation = true,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, planSlug: "pro");
        var service = TestSupport.Entitlements(_db);

        var snapshot = await service.ResolveAsync(tenant.Id, CancellationToken.None);

        // In Postpaid mode, overage does not sever access
        Assert.True(snapshot.Has(EntitlementKeys.FeatureTeleconsultation));
    }

    [Fact]
    public async Task OptInPayg_SuperAdminOverride_TakesAbsolutePrecedence_OverAllBillingConfigurations()
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "superadmin-override-test", Name = "Override Clinic" };
        _db.Tenants.Add(tenant);

        // Case A: Billing is strictly disabled AND prepaid balance is 0
        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = false,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            PrepaidBalancePhp = 0m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);

        // SuperAdmin grants explicit override: Enabled = true
        var adminOverride = new EntitlementOverride
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Key = EntitlementKeys.FeatureTeleconsultation,
            Kind = EntitlementKind.Feature,
            Enabled = true,
            Reason = "Executive VIP grant"
        };
        _db.EntitlementOverrides.Add(adminOverride);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, planSlug: "pro");
        var service = TestSupport.Entitlements(_db);

        var snapshotWithGrant = await service.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.True(snapshotWithGrant.Has(EntitlementKeys.FeatureTeleconsultation));

        // Case B: Billing is enabled in Postpaid mode with huge budget, but SuperAdmin explicitly REVOKES: Enabled = false
        adminOverride.Enabled = false;
        adminOverride.Reason = "Compliance block";
        billing.IsEnabled = true;
        billing.BillingMode = WorkspaceTeleconsultBilling.ModePostpaid;
        await _db.SaveChangesAsync();

        var snapshotWithRevoke = await service.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.False(snapshotWithRevoke.Has(EntitlementKeys.FeatureTeleconsultation));
    }

    [Fact]
    public async Task OptInPayg_PlanLevelFeatureInjection_CannotBypassGatingWhenBillingIsDisabled()
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "plan-injection-test", Name = "Injection Test Clinic" };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        // Seed a plan that maliciously or accidentally includes FeatureTeleconsultation in its plan entitlements
        var plan = new Plan
        {
            Id = Guid.NewGuid(),
            Slug = "custom-legacy-plan",
            Name = "Custom Legacy Plan",
            Rank = 50,
            Entitlements = new List<PlanEntitlement>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Key = EntitlementKeys.FeatureTeleconsultation,
                    Kind = EntitlementKind.Feature,
                    Enabled = true
                }
            }
        };
        _db.Plans.Add(plan);

        var sub = new Subscription
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            PlanId = plan.Id,
            Status = SubscriptionStatus.Active,
            CurrentPeriodEnd = DateTime.UtcNow.AddMonths(1)
        };
        _db.Subscriptions.Add(sub);

        // Workspace billing is NOT enabled
        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = false,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var service = TestSupport.Entitlements(_db);
        var snapshot = await service.ResolveAsync(tenant.Id, CancellationToken.None);

        // Even though Plan.Entitlements had FeatureTeleconsultation, EntitlementService MUST remove it
        Assert.False(snapshot.Has(EntitlementKeys.FeatureTeleconsultation));
    }

    #endregion

    #region 2. Zero-PHI Invariant Across Models and Endpoints

    [Fact]
    public void ZeroPhi_TeleconsultUsageRecord_ContainsNoPatientIdentifyingFields()
    {
        var properties = typeof(TeleconsultUsageRecord).GetProperties(BindingFlags.Public | BindingFlags.Instance);
        var propertyNames = properties.Select(p => p.Name.ToLowerInvariant()).ToList();

        var forbiddenPhiTerms = new[]
        {
            "patient", "patientid", "patientname", "name", "dob", "birth", "dateofbirth",
            "phone", "mobile", "email", "address", "ssn", "philhealth",
            "clinical", "note", "notes", "diagnosis", "prescription", "rx", "medical"
        };

        foreach (var term in forbiddenPhiTerms)
        {
            Assert.DoesNotContain(term, propertyNames);
        }

        // Verify only authorized billing/teleconsult ledger properties exist
        var expectedAllowed = new HashSet<string>
        {
            "id", "callid", "tenantid", "durationminutes", "rateperminutephp",
            "totalcostphp", "prepaiddeductedphp", "postpaidoveragephp",
            "callstartedatutc", "callendedatutc",
            "createdat", "createdby", "updatedat", "updatedby", "isdeleted", "deletedat", "deletedby", "allowharddelete"
        };

        foreach (var propName in propertyNames)
        {
            Assert.Contains(propName, expectedAllowed);
        }
    }

    [Fact]
    public void ZeroPhi_MediaUsageRecordedPayload_ContainsNoPatientIdentifyingFields()
    {
        var properties = typeof(MediaUsageRecordedPayload).GetProperties(BindingFlags.Public | BindingFlags.Instance);
        var propertyNames = properties.Select(p => p.Name).OrderBy(n => n).ToList();

        var expectedProperties = new[]
        {
            nameof(MediaUsageRecordedPayload.CallEndedAtUtc),
            nameof(MediaUsageRecordedPayload.CallId),
            nameof(MediaUsageRecordedPayload.CallStartedAtUtc),
            nameof(MediaUsageRecordedPayload.DurationMinutes),
            nameof(MediaUsageRecordedPayload.TenantId)
        }.OrderBy(n => n).ToList();

        Assert.Equal(expectedProperties, propertyNames);
    }

    [Fact]
    public void ZeroPhi_GuestStatusAndVerifyResponses_ContainNoPatientIdentifyingFields()
    {
        var statusProps = typeof(GuestTeleconsultStatusResponse).GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name.ToLowerInvariant());

        var forbiddenTerms = new[] { "patient", "name", "dob", "birth", "phone", "email", "clinical", "note", "diagnosis" };

        foreach (var term in forbiddenTerms)
        {
            Assert.DoesNotContain(term, statusProps);
        }

        var verifyProps = typeof(GuestTeleconsultVerifyResponse).GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name.ToLowerInvariant());

        foreach (var term in forbiddenTerms)
        {
            Assert.DoesNotContain(term, verifyProps);
        }
    }

    [Fact]
    public async Task ZeroPhi_MediaUsageRecordedHandler_StoresZeroPhiInDatabase()
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "zero-phi-corp", Name = "Zero PHI Corp" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);

        var callId = Guid.NewGuid();
        var startedAt = DateTime.UtcNow.AddMinutes(-20);
        var endedAt = DateTime.UtcNow;

        var payload = new MediaUsageRecordedPayload(
            callId,
            tenant.TenantSlug,
            20,
            startedAt,
            endedAt);

        var envelope = InteropEnvelope.Create(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            Guid.NewGuid(),
            payload);
        var context = new InteropMessageContext(envelope);

        await handler.HandleAsync(payload, context, CancellationToken.None);

        var record = await _db.TeleconsultUsageRecords.FirstOrDefaultAsync(r => r.CallId == callId);
        Assert.NotNull(record);
        Assert.Equal(callId, record!.CallId);
        Assert.Equal(tenant.Id.ToString(), record.TenantId);
        Assert.Equal(20, record.DurationMinutes);
        Assert.Equal(5.00m, record.RatePerMinutePhp);
        Assert.Equal(100.00m, record.TotalCostPhp);
        Assert.Equal(0m, record.PrepaidDeductedPhp);
        Assert.Equal(0m, record.PostpaidOveragePhp);
        Assert.Equal(startedAt, record.CallStartedAtUtc);
        Assert.Equal(endedAt, record.CallEndedAtUtc);
    }

    #endregion

    #region 3. Revocation Status Endpoint: GET /portal/guest/teleconsult/status

    [Fact]
    public void RevocationStatus_RevokedInvite_Returns410GoneWithGuestConsultationEnded()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "m12-revoked-token-single";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-alpha",
            "fac-clinic-1",
            callId,
            inviteToken,
            "1992-04-12",
            "654321",
            DateTime.UtcNow.AddHours(1));

        // Act: Revoke the consultation
        var revoked = _verificationService.RevokeInviteByCall(callId, "Physician ended appointment");
        Assert.True(revoked);

        // Check status
        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(
            inviteToken,
            _verificationService);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status410Gone, statusResult.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(valueResult.Value);

        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_CONSULTATION_ENDED", apiResponse.ErrorCode);
        Assert.Contains("ended by the attending clinician", apiResponse.Message);
    }

    [Fact]
    public void RevocationStatus_MultipleInvitesForSameCallId_AllRevoked_AllReturn410Gone()
    {
        var callId = Guid.NewGuid();
        var inviteId1 = Guid.NewGuid();
        var inviteId2 = Guid.NewGuid();
        const string inviteToken1 = "m12-token-patient";
        const string inviteToken2 = "m12-token-guardian";

        GuestVerificationService.RegisterInvite(
            inviteId1,
            "tenant-alpha",
            "fac-clinic-1",
            callId,
            inviteToken1,
            "1985-06-20",
            "111222",
            DateTime.UtcNow.AddHours(1));

        GuestVerificationService.RegisterInvite(
            inviteId2,
            "tenant-alpha",
            "fac-clinic-1",
            callId,
            inviteToken2,
            "1960-03-15",
            "333444",
            DateTime.UtcNow.AddHours(1));

        // Explicit clinician end revokes by CallId
        _verificationService.RevokeInviteByCall(callId, "Session terminated");

        // Verify both tokens return 410 Gone
        var result1 = PublicGuestTeleconsultEndpoints.HandleStatusAsync(inviteToken1, _verificationService);
        var result2 = PublicGuestTeleconsultEndpoints.HandleStatusAsync(inviteToken2, _verificationService);

        var status1 = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result1);
        var status2 = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result2);

        Assert.Equal(StatusCodes.Status410Gone, status1.StatusCode);
        Assert.Equal(StatusCodes.Status410Gone, status2.StatusCode);

        var apiResponse1 = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(((IValueHttpResult)result1).Value);
        var apiResponse2 = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(((IValueHttpResult)result2).Value);

        Assert.Equal("GUEST_CONSULTATION_ENDED", apiResponse1.ErrorCode);
        Assert.Equal("GUEST_CONSULTATION_ENDED", apiResponse2.ErrorCode);
    }

    [Fact]
    public void RevocationStatus_WhitespaceInToken_TrimmedAndDetectsRevocation()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "m12-token-spaces";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-alpha",
            "fac-clinic-1",
            callId,
            inviteToken,
            "1990-01-01",
            "123456",
            DateTime.UtcNow.AddHours(1));

        _verificationService.RevokeInviteByCall(callId, "Ended");

        // Request with leading and trailing whitespace
        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(
            $"   {inviteToken}   ",
            _verificationService);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status410Gone, statusResult.StatusCode);

        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(((IValueHttpResult)result).Value);
        Assert.Equal("GUEST_CONSULTATION_ENDED", apiResponse.ErrorCode);
    }

    [Fact]
    public async Task RevocationStatus_VerifyEndpoint_AlsoReturns410GoneForRevokedInvite()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "m12-verify-revoked-token";
        const string dob = "1994-08-25";
        const string otp = "789123";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-alpha",
            "fac-clinic-1",
            callId,
            inviteToken,
            dob,
            otp,
            DateTime.UtcNow.AddHours(1));

        _verificationService.RevokeInviteByCall(callId, "Clinician exited");

        // Submit valid DOB and OTP for revoked invite
        var request = new GuestTeleconsultVerifyRequest(inviteToken, dob, otp);
        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status410Gone, statusResult.StatusCode);

        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(((IValueHttpResult)result).Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_CONSULTATION_ENDED", apiResponse.ErrorCode);
    }

    [Theory]
    [InlineData("rx-abcdef123456")]
    [InlineData("mc-987654321")]
    [InlineData("lab-upload-token")]
    [InlineData("ref-referral-document")]
    public void RevocationStatus_ClinicalDocumentTokens_Return400BadRequestDocumentKindMismatch(string documentToken)
    {
        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(documentToken, _verificationService);

        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);

        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(((IValueHttpResult)result).Value);
        Assert.Equal("DOCUMENT_KIND_MISMATCH", apiResponse.ErrorCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void RevocationStatus_EmptyOrWhitespaceToken_Returns400BadRequest(string? emptyToken)
    {
        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(emptyToken, _verificationService);

        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);

        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(((IValueHttpResult)result).Value);
        Assert.Equal("EMPTY_TOKEN", apiResponse.ErrorCode);
    }

    [Fact]
    public void RevocationStatus_NonExistentToken_Returns404NotFound()
    {
        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync("completely-unknown-token-9999", _verificationService);

        var notFound = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFound.StatusCode);

        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(((IValueHttpResult)result).Value);
        Assert.Equal("GUEST_INVITE_NOT_FOUND", apiResponse.ErrorCode);
    }

    [Fact]
    public void RevocationStatus_ActiveInvite_Returns200OkWithActiveStatus()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "m12-active-token";
        var expiresAt = DateTime.UtcNow.AddMinutes(45);

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-alpha",
            "fac-clinic-1",
            callId,
            inviteToken,
            "1990-01-01",
            "123456",
            expiresAt);

        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(inviteToken, _verificationService);

        var okResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);

        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(((IValueHttpResult)result).Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.Equal("Active", apiResponse.Data.Status);
        Assert.False(apiResponse.Data.IsEnded);
        Assert.False(apiResponse.Data.IsExpired);
        Assert.False(apiResponse.Data.IsLockedOut);
        Assert.Equal(expiresAt, apiResponse.Data.ExpiresAtUtc);
    }

    [Fact]
    public void RevocationStatus_ExpiredInvite_Returns410GoneWithGuestInviteExpired()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "m12-expired-token";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-alpha",
            "fac-clinic-1",
            callId,
            inviteToken,
            "1990-01-01",
            "123456",
            DateTime.UtcNow.AddMinutes(-5)); // Expired 5 minutes ago

        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(inviteToken, _verificationService);

        var goneResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status410Gone, goneResult.StatusCode);

        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(((IValueHttpResult)result).Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_INVITE_EXPIRED", apiResponse.ErrorCode);
    }

    [Fact]
    public void RevocationStatus_LockedOutInvite_Returns423LockedWithGuestInviteLockedOut()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "m12-locked-token";

        var invite = GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-alpha",
            "fac-clinic-1",
            callId,
            inviteToken,
            "1990-01-01",
            "123456",
            DateTime.UtcNow.AddHours(1));

        invite.AttemptCount = 5;
        invite.IsLockedOut = true;

        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(inviteToken, _verificationService);

        var lockedResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status423Locked, lockedResult.StatusCode);

        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultStatusResponse>>(((IValueHttpResult)result).Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", apiResponse.ErrorCode);
    }

    #endregion
}
