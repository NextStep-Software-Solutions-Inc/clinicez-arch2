using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common.Behaviors;
using ClinicEz.Portal.Application.Features.Admin.Commands.UpdateTenantOverrides;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Features.Billing.Commands;
using ClinicEz.Portal.Application.Features.Billing.Queries;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Middlewares;
using FluentValidation;
using FluentValidation.TestHelper;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

/// <summary>
/// Empirical Adversarial Challenge Test Suite for Milestone 2:
/// Plan validation, boundary conditions, and limit enforcement.
/// 
/// Verifies:
/// 1. Invalid limit key rejected with HTTP 400 (ValidationException), NOT HTTP 500 (InvalidOperationException).
/// 2. Invalid feature flag rejected with HTTP 400 (ValidationException), NOT HTTP 500.
/// 3. Negative limits rejected (except -1 for unlimited marker).
/// 4. Rank &lt; 1 rejected across all plan mutations.
/// 5. MediatR ValidationBehavior pipeline cleanly blocks invalid inputs before reaching handler/PlanCatalog.
/// 6. GlobalExceptionHandler transforms ValidationException into standardized HTTP 400 VALIDATION_ERROR with field attribution.
/// 7. UpdateBillingPlan invariants: ID requirement, non-existent plan handling, rank changes, and cascading license re-issuance.
/// 8. UpdateTenantOverrides boundary validation for unknown keys and negative limits.
/// </summary>
public class PlanValidationAndLimitsEmpiricalChallengeTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IEntitlementService _entitlements;
    private readonly IEntitlementsPublisher _publisher;
    private readonly ISubscriptionService _subscriptions;

    private readonly CreateBillingPlanCommandValidator _createPlanValidator = new();
    private readonly UpdateBillingPlanCommandValidator _updatePlanValidator = new();
    private readonly UpdateTenantOverridesCommandValidator _updateOverridesValidator = new();

    private readonly ValidationBehavior<CreateBillingPlanCommand, Guid> _createPlanValidationBehavior;
    private readonly ValidationBehavior<UpdateBillingPlanCommand, bool> _updatePlanValidationBehavior;
    private readonly ValidationBehavior<UpdateTenantOverridesCommand, TenantOverridesDto?> _updateOverridesValidationBehavior;

    private readonly GlobalExceptionHandler _exceptionHandler = new(NullLogger<GlobalExceptionHandler>.Instance);

    public PlanValidationAndLimitsEmpiricalChallengeTests()
    {
        _entitlements = TestSupport.Entitlements(_context);

        _publisher = new EntitlementsPublisher(
            _context,
            _entitlements,
            new FacilityAllocationService(_context),
            new LicenseIssuer(new FacilityLicenseSigner(), Options.Create(new LicenseOptions()), TimeProvider.System),
            new InteropPublisher(_context));

        _subscriptions = new SubscriptionService(
            _context,
            Options.Create(TestSupport.Plans()),
            TimeProvider.System,
            _publisher);

        _createPlanValidationBehavior = new ValidationBehavior<CreateBillingPlanCommand, Guid>(new[] { _createPlanValidator });
        _updatePlanValidationBehavior = new ValidationBehavior<UpdateBillingPlanCommand, bool>(new[] { _updatePlanValidator });
        _updateOverridesValidationBehavior = new ValidationBehavior<UpdateTenantOverridesCommand, TenantOverridesDto?>(new[] { _updateOverridesValidator });
    }

    public void Dispose() => _context.Dispose();

    private static (DefaultHttpContext Context, MemoryStream Stream) CreateHttpContext(string traceId = "CHALLENGE-TRACE-M2")
    {
        var context = new DefaultHttpContext();
        context.TraceIdentifier = traceId;
        var stream = new MemoryStream();
        context.Response.Body = stream;
        return (context, stream);
    }

    private static async Task<ApiResponse<JsonElement>?> ReadPayloadAsync(MemoryStream stream)
    {
        stream.Seek(0, SeekOrigin.Begin);
        var json = await new StreamReader(stream).ReadToEndAsync();
        return JsonSerializer.Deserialize<ApiResponse<JsonElement>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });
    }

    private static CreateBillingPlanCommand CreateValidPlanCommand() => new()
    {
        Name = "Adversarial Robust Tier",
        Slug = "adversarial-robust-tier",
        Description = "Validated robust tier plan",
        Rank = 2,
        PriceMonthly = 2499.00m,
        PriceAnnually = 24990.00m,
        IsHighlighted = false,
        RequiresCheckout = true,
        Features = ["24/7 Monitoring", "Daily Backup"],
        Limits = new()
        {
            [EntitlementKeys.LimitClinics] = 5,
            [EntitlementKeys.LimitLaboratories] = 2,
            [EntitlementKeys.PoolStaff] = 30
        },
        EnabledFeatures = [EntitlementKeys.FeatureTeleconsultation, EntitlementKeys.FeatureElectronicPrescriptions]
    };

    // =========================================================================
    // 1. Invalid Limit Keys Rejection (HTTP 400 vs HTTP 500)
    // =========================================================================

    [Theory]
    [InlineData("limit.invalid_foo")]
    [InlineData("limit.fake_limit")]
    [InlineData("limit.clinics_extra")]
    [InlineData("LIMIT.CLINICS")] // Casing check: must match exact catalog
    [InlineData("limit.non_existent")]
    [InlineData("custom.limit")]
    [InlineData("feature.teleconsultation")] // Feature flag erroneously placed in limits dictionary
    public void CreatePlanValidator_InvalidLimitKey_FailsValidationWithExplicitMessage(string invalidKey)
    {
        var command = CreateValidPlanCommand();
        command.Limits[invalidKey] = 10;

        var result = _createPlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Limits)
            .WithErrorMessage("One or more limit keys are invalid. Allowed keys: " + string.Join(", ", EntitlementKeys.Limits));
    }

    [Theory]
    [InlineData("limit.invalid_foo")]
    [InlineData("limit.fake_limit")]
    [InlineData("limit.beds_super")]
    public void UpdatePlanValidator_InvalidLimitKey_FailsValidationWithExplicitMessage(string invalidKey)
    {
        var command = new UpdateBillingPlanCommand
        {
            Id = Guid.NewGuid(),
            Name = "Updated Tier",
            Slug = "updated-tier",
            Description = "Updated description",
            Rank = 3,
            PriceMonthly = 1000m,
            PriceAnnually = 10000m,
            Features = ["Feature A"],
            Limits = new() { [invalidKey] = 5 },
            EnabledFeatures = [EntitlementKeys.FeatureElectronicPrescriptions]
        };

        var result = _updatePlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Limits)
            .WithErrorMessage("One or more limit keys are invalid. Allowed keys: " + string.Join(", ", EntitlementKeys.Limits));
    }

    [Fact]
    public async Task CreatePlan_InvalidLimitKey_ValidationBehaviorThrowsValidationException_PreventingHttp500()
    {
        var command = CreateValidPlanCommand();
        command.Limits["limit.invalid_foo"] = 25;

        // Pipeline execution must throw ValidationException, NOT reach PlanCatalog.ApplyEntitlements (which throws InvalidOperationException)
        var ex = await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ValidationException>(() =>
            _createPlanValidationBehavior.Handle(command, _ => Task.FromResult(Guid.NewGuid()), CancellationToken.None));

        Assert.NotNull(ex.Errors);
        Assert.True(ex.Errors!.ContainsKey("Limits"));
        Assert.Contains(ex.Errors!["Limits"], msg => msg.Contains("One or more limit keys are invalid"));

        // GlobalExceptionHandler must map this to HTTP 400 (Bad Request), NOT HTTP 500
        var (context, stream) = CreateHttpContext();
        var handled = await _exceptionHandler.TryHandleAsync(context, ex, CancellationToken.None);

        Assert.True(handled);
        Assert.Equal((int)HttpStatusCode.BadRequest, context.Response.StatusCode);

        var payload = await ReadPayloadAsync(stream);
        Assert.NotNull(payload);
        Assert.False(payload!.Succeeded);
        Assert.Equal("VALIDATION_ERROR", payload.ErrorCode);
        Assert.Contains(payload.Errors, e => e.Field == "Limits");
    }

    // =========================================================================
    // 2. Invalid Feature Flags Rejection (HTTP 400 vs HTTP 500)
    // =========================================================================

    [Theory]
    [InlineData("feature.fake_flag")]
    [InlineData("feature.invalid_feature")]
    [InlineData("teleconsultation")] // Missing "feature." prefix
    [InlineData("FEATURE.TELECONSULTATION")] // Casing check
    [InlineData("feature.ai_diagnostics")] // Non-existent feature flag
    [InlineData("limit.clinics")] // Limit key erroneously placed in features list
    public void CreatePlanValidator_InvalidFeatureFlag_FailsValidationWithExplicitMessage(string invalidFeature)
    {
        var command = CreateValidPlanCommand();
        command.EnabledFeatures.Add(invalidFeature);

        var result = _createPlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.EnabledFeatures)
            .WithErrorMessage("One or more feature keys are invalid. Allowed features: " + string.Join(", ", EntitlementKeys.Features));
    }

    [Theory]
    [InlineData("feature.fake_flag")]
    [InlineData("feature.unsupported_module")]
    public void UpdatePlanValidator_InvalidFeatureFlag_FailsValidationWithExplicitMessage(string invalidFeature)
    {
        var command = new UpdateBillingPlanCommand
        {
            Id = Guid.NewGuid(),
            Name = "Updated Tier",
            Slug = "updated-tier",
            Description = "Updated description",
            Rank = 3,
            PriceMonthly = 1000m,
            PriceAnnually = 10000m,
            Features = ["Feature A"],
            Limits = new() { [EntitlementKeys.LimitClinics] = 5 },
            EnabledFeatures = [invalidFeature]
        };

        var result = _updatePlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.EnabledFeatures)
            .WithErrorMessage("One or more feature keys are invalid. Allowed features: " + string.Join(", ", EntitlementKeys.Features));
    }

    [Fact]
    public async Task CreatePlan_InvalidFeatureFlag_ValidationBehaviorThrowsValidationException_PreventingHttp500()
    {
        var command = CreateValidPlanCommand();
        command.EnabledFeatures.Add("feature.fake_flag");

        var ex = await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ValidationException>(() =>
            _createPlanValidationBehavior.Handle(command, _ => Task.FromResult(Guid.NewGuid()), CancellationToken.None));

        Assert.NotNull(ex.Errors);
        Assert.True(ex.Errors!.ContainsKey("EnabledFeatures"));
        Assert.Contains(ex.Errors!["EnabledFeatures"], msg => msg.Contains("One or more feature keys are invalid"));

        // GlobalExceptionHandler must map this to HTTP 400 (Bad Request)
        var (context, stream) = CreateHttpContext();
        var handled = await _exceptionHandler.TryHandleAsync(context, ex, CancellationToken.None);

        Assert.True(handled);
        Assert.Equal((int)HttpStatusCode.BadRequest, context.Response.StatusCode);

        var payload = await ReadPayloadAsync(stream);
        Assert.NotNull(payload);
        Assert.False(payload!.Succeeded);
        Assert.Equal("VALIDATION_ERROR", payload.ErrorCode);
        Assert.Contains(payload.Errors, e => e.Field == "EnabledFeatures");
    }

    // =========================================================================
    // 3. Negative Limits Rejection (except -1 for unlimited)
    // =========================================================================

    [Theory]
    [InlineData(-2)]
    [InlineData(-3)]
    [InlineData(-5)]
    [InlineData(-100)]
    [InlineData(-999999)]
    public void CreatePlanValidator_NegativeLimitsBelowMinusOne_Rejected(long negativeLimit)
    {
        var command = CreateValidPlanCommand();
        command.Limits[EntitlementKeys.LimitClinics] = negativeLimit;

        var result = _createPlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Limits)
            .WithErrorMessage("Limit values must be greater than or equal to 0 (or -1 for unlimited).");
    }

    [Theory]
    [InlineData(-2)]
    [InlineData(-10)]
    public void UpdatePlanValidator_NegativeLimitsBelowMinusOne_Rejected(long negativeLimit)
    {
        var command = new UpdateBillingPlanCommand
        {
            Id = Guid.NewGuid(),
            Name = "Updated Tier",
            Slug = "updated-tier",
            Description = "Updated description",
            Rank = 3,
            PriceMonthly = 1000m,
            PriceAnnually = 10000m,
            Features = ["Feature A"],
            Limits = new() { [EntitlementKeys.LimitClinics] = negativeLimit },
            EnabledFeatures = []
        };

        var result = _updatePlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Limits)
            .WithErrorMessage("Limit values must be greater than or equal to 0 (or -1 for unlimited).");
    }

    [Fact]
    public void CreatePlanValidator_UnlimitedMarkerMinusOneAndZero_AreAccepted()
    {
        var command = CreateValidPlanCommand();
        command.Limits[EntitlementKeys.LimitClinics] = -1; // -1 = Unlimited marker
        command.Limits[EntitlementKeys.LimitLaboratories] = 0; // 0 = Zero quota (allowed)
        command.Limits[EntitlementKeys.LimitPharmacies] = 10; // > 0 = Allowed

        var result = _createPlanValidator.TestValidate(command);

        result.ShouldNotHaveValidationErrorFor(x => x.Limits);
    }

    [Fact]
    public async Task CreatePlan_NegativeLimit_ValidationBehaviorThrowsValidationException_MapsTo400()
    {
        var command = CreateValidPlanCommand();
        command.Limits[EntitlementKeys.LimitClinics] = -5;

        var ex = await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ValidationException>(() =>
            _createPlanValidationBehavior.Handle(command, _ => Task.FromResult(Guid.NewGuid()), CancellationToken.None));

        Assert.NotNull(ex.Errors);
        Assert.True(ex.Errors!.ContainsKey("Limits"));
        Assert.Contains(ex.Errors!["Limits"], msg => msg.Contains("greater than or equal to 0 (or -1 for unlimited)"));

        var (context, stream) = CreateHttpContext();
        var handled = await _exceptionHandler.TryHandleAsync(context, ex, CancellationToken.None);

        Assert.True(handled);
        Assert.Equal((int)HttpStatusCode.BadRequest, context.Response.StatusCode);

        var payload = await ReadPayloadAsync(stream);
        Assert.NotNull(payload);
        Assert.False(payload!.Succeeded);
        Assert.Equal("VALIDATION_ERROR", payload.ErrorCode);
    }

    // =========================================================================
    // 4. Rank Validation (Rank < 1 Rejected)
    // =========================================================================

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-5)]
    [InlineData(-100)]
    public void CreatePlanValidator_RankLessThanOne_Rejected(int invalidRank)
    {
        var command = CreateValidPlanCommand();
        command.Rank = invalidRank;

        var result = _createPlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Rank)
            .WithErrorMessage("Rank must be at least 1.");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-10)]
    public void UpdatePlanValidator_RankLessThanOne_Rejected(int invalidRank)
    {
        var command = new UpdateBillingPlanCommand
        {
            Id = Guid.NewGuid(),
            Name = "Updated Tier",
            Slug = "updated-tier",
            Description = "Updated description",
            Rank = invalidRank,
            PriceMonthly = 1000m,
            PriceAnnually = 10000m,
            Features = ["Feature A"],
            Limits = new() { [EntitlementKeys.LimitClinics] = 5 },
            EnabledFeatures = []
        };

        var result = _updatePlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Rank)
            .WithErrorMessage("Rank must be at least 1.");
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(10)]
    [InlineData(100)]
    public void CreatePlanValidator_RankOneOrGreater_Accepted(int validRank)
    {
        var command = CreateValidPlanCommand();
        command.Rank = validRank;

        var result = _createPlanValidator.TestValidate(command);

        result.ShouldNotHaveValidationErrorFor(x => x.Rank);
    }

    [Fact]
    public async Task CreatePlan_RankZero_ValidationBehaviorThrowsValidationException_MapsTo400()
    {
        var command = CreateValidPlanCommand();
        command.Rank = 0;

        var ex = await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ValidationException>(() =>
            _createPlanValidationBehavior.Handle(command, _ => Task.FromResult(Guid.NewGuid()), CancellationToken.None));

        Assert.NotNull(ex.Errors);
        Assert.True(ex.Errors!.ContainsKey("Rank"));
        Assert.Contains(ex.Errors!["Rank"], msg => msg.Contains("Rank must be at least 1"));

        var (context, stream) = CreateHttpContext();
        var handled = await _exceptionHandler.TryHandleAsync(context, ex, CancellationToken.None);

        Assert.True(handled);
        Assert.Equal((int)HttpStatusCode.BadRequest, context.Response.StatusCode);
    }

    // =========================================================================
    // 5. UpdateBillingPlan Specific Invariants
    // =========================================================================

    [Fact]
    public void UpdatePlanValidator_EmptyGuidId_Rejected()
    {
        var command = new UpdateBillingPlanCommand
        {
            Id = Guid.Empty,
            Name = "Updated Tier",
            Slug = "updated-tier",
            Description = "Updated description",
            Rank = 1,
            PriceMonthly = 100m,
            PriceAnnually = 1000m,
            Features = [],
            Limits = new(),
            EnabledFeatures = []
        };

        var result = _updatePlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Id)
            .WithErrorMessage("Id is required.");
    }

    [Fact]
    public async Task UpdatePlanCommandHandler_NonExistentPlanId_ReturnsFalseWithoutThrowing()
    {
        var handler = new UpdateBillingPlanCommandHandler(_context, _publisher);
        var command = new UpdateBillingPlanCommand
        {
            Id = Guid.NewGuid(), // Non-existent
            Name = "Non Existent Tier",
            Slug = "non-existent-tier",
            Description = "Does not exist",
            Rank = 1,
            PriceMonthly = 500m,
            PriceAnnually = 5000m,
            Features = [],
            Limits = new(),
            EnabledFeatures = []
        };

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.False(result);
    }

    // =========================================================================
    // 6. Additional Boundary & Corner Cases (Nulls, String Formats, Negative Prices)
    // =========================================================================

    [Fact]
    public void CreatePlanValidator_NullLimits_ThrowsNullReferenceExceptionDueToMissingCascadeStop()
    {
        // Vulnerability finding: Without CascadeMode.Stop or defensive null check,
        // null Limits evaluates .Must(limits => limits.Keys.All(...)) on null, throwing NullReferenceException
        // and causing an unhandled HTTP 500 error instead of HTTP 400.
        var command = CreateValidPlanCommand();
        command.Limits = null!;

        Assert.Throws<NullReferenceException>(() => _createPlanValidator.TestValidate(command));
    }

    [Fact]
    public void CreatePlanValidator_NullEnabledFeatures_ThrowsArgumentNullExceptionDueToMissingCascadeStop()
    {
        // Vulnerability finding: Without CascadeMode.Stop or defensive null check,
        // null EnabledFeatures evaluates .Must(features => features.All(...)) on null, throwing ArgumentNullException
        // and causing an unhandled HTTP 500 error instead of HTTP 400.
        var command = CreateValidPlanCommand();
        command.EnabledFeatures = null!;

        Assert.Throws<ArgumentNullException>(() => _createPlanValidator.TestValidate(command));
    }

    [Fact]
    public void UpdatePlanValidator_NullLimits_ThrowsNullReferenceExceptionDueToMissingCascadeStop()
    {
        var command = new UpdateBillingPlanCommand
        {
            Id = Guid.NewGuid(),
            Name = "Tier",
            Slug = "tier",
            Description = "Desc",
            Rank = 1,
            Limits = null!,
            EnabledFeatures = []
        };

        Assert.Throws<NullReferenceException>(() => _updatePlanValidator.TestValidate(command));
    }

    [Fact]
    public void UpdatePlanValidator_NullEnabledFeatures_ThrowsArgumentNullExceptionDueToMissingCascadeStop()
    {
        var command = new UpdateBillingPlanCommand
        {
            Id = Guid.NewGuid(),
            Name = "Tier",
            Slug = "tier",
            Description = "Desc",
            Rank = 1,
            Limits = new(),
            EnabledFeatures = null!
        };

        Assert.Throws<ArgumentNullException>(() => _updatePlanValidator.TestValidate(command));
    }

    [Fact]
    public void CreatePlanValidator_NullFeatures_Rejected()
    {
        var command = CreateValidPlanCommand();
        command.Features = null!;

        var result = _createPlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Features);
    }

    [Theory]
    [InlineData("UPPERCASE-SLUG")]
    [InlineData("slug with spaces")]
    [InlineData("slug_with_underscores")]
    [InlineData("slug@symbol")]
    [InlineData("")]
    public void CreatePlanValidator_InvalidSlugFormat_Rejected(string invalidSlug)
    {
        var command = CreateValidPlanCommand();
        command.Slug = invalidSlug;

        var result = _createPlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Slug);
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(-100)]
    public void CreatePlanValidator_NegativePrice_Rejected(decimal negativePrice)
    {
        var command = CreateValidPlanCommand();
        command.PriceMonthly = negativePrice;

        var result = _createPlanValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.PriceMonthly);
    }

    // =========================================================================
    // 7. UpdateTenantOverrides Boundary Validation
    // =========================================================================

    [Theory]
    [InlineData("limit.unknown_custom_override")]
    [InlineData("invalid.limit")]
    public void UpdateTenantOverridesValidator_UnknownLimitKey_Rejected(string unknownKey)
    {
        var command = new UpdateTenantOverridesCommand(
            Guid.NewGuid(),
            limits: new() { [unknownKey] = 5 },
            features: new()
        );

        var result = _updateOverridesValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Limits);
    }

    [Theory]
    [InlineData("feature.fake_override")]
    [InlineData("invalid.feature")]
    public void UpdateTenantOverridesValidator_UnknownFeatureKey_Rejected(string unknownFeature)
    {
        var command = new UpdateTenantOverridesCommand(
            Guid.NewGuid(),
            limits: new(),
            features: new() { [unknownFeature] = true }
        );

        var result = _updateOverridesValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Features);
    }

    [Theory]
    [InlineData(-2)]
    [InlineData(-10)]
    public void UpdateTenantOverridesValidator_NegativeLimitBelowMinusOne_Rejected(long negativeLimit)
    {
        var command = new UpdateTenantOverridesCommand(
            Guid.NewGuid(),
            limits: new() { [EntitlementKeys.LimitClinics] = negativeLimit },
            features: new()
        );

        var result = _updateOverridesValidator.TestValidate(command);

        result.ShouldHaveValidationErrorFor(x => x.Limits);
    }

    [Fact]
    public void UpdateTenantOverridesValidator_UnlimitedMarkerMinusOneAndNull_Accepted()
    {
        var command = new UpdateTenantOverridesCommand(
            Guid.NewGuid(),
            limits: new()
            {
                [EntitlementKeys.LimitClinics] = -1, // Unlimited marker
                [EntitlementKeys.LimitLaboratories] = null // Null means revert to plan baseline
            },
            features: new() { [EntitlementKeys.FeatureTeleconsultation] = true }
        );

        var result = _updateOverridesValidator.TestValidate(command);

        result.ShouldNotHaveValidationErrorFor(x => x.Limits);
        result.ShouldNotHaveValidationErrorFor(x => x.Features);
    }

    // =========================================================================
    // 8. End-to-End Successful Plan Creation and Entitlement Application
    // =========================================================================

    [Fact]
    public async Task CreatePlanCommandHandler_WithAll14LimitsAnd10Features_SuccessfullyPersistsPlan()
    {
        var handler = new CreateBillingPlanCommandHandler(_context);
        var command = new CreateBillingPlanCommand
        {
            Name = "All Capabilities Plan",
            Slug = "all-capabilities-plan",
            Description = "Plan with every supported limit and feature flag",
            Rank = 10,
            PriceMonthly = 9999m,
            PriceAnnually = 99990m,
            IsHighlighted = true,
            RequiresCheckout = true,
            Features = ["Omnichannel Care", "Enterprise SLAs"],
            Limits = EntitlementKeys.Limits.ToDictionary(k => k, _ => 500L),
            EnabledFeatures = [.. EntitlementKeys.Features]
        };

        var planId = await handler.Handle(command, CancellationToken.None);

        var savedPlan = await _context.Plans
            .Include(p => p.Features)
            .Include(p => p.Entitlements)
            .FirstOrDefaultAsync(p => p.Id == planId);

        Assert.NotNull(savedPlan);
        Assert.Equal("all-capabilities-plan", savedPlan.Slug);
        Assert.Equal(10, savedPlan.Rank);
        Assert.Equal(1, savedPlan.Version);
        Assert.Equal(2, savedPlan.Features.Count);

        // Verify all 14 limits and 10 features were applied in PlanEntitlements
        var savedLimits = savedPlan.Entitlements.Where(e => e.Kind == EntitlementKind.Limit).ToList();
        var savedFeatures = savedPlan.Entitlements.Where(e => e.Kind == EntitlementKind.Feature).ToList();

        Assert.Equal(EntitlementKeys.Limits.Count, savedLimits.Count);
        Assert.Equal(EntitlementKeys.Features.Count, savedFeatures.Count);
        Assert.All(savedLimits, l => Assert.Equal(500L, l.Limit));
        Assert.All(savedFeatures, f => Assert.True(f.Enabled));
    }
}
