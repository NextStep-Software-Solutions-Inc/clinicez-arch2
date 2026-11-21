using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Billing;

public class BillingConfigEndpointTests
{
    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    private static WebApplication CreateTestApp()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddRouting();
        builder.Services.AddAuthorization();
        builder.Services.AddSingleton(Moq.Mock.Of<ISystemSettingsService>());
        builder.Services.AddSingleton(Moq.Mock.Of<MediatR.ISender>());
        builder.Services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(Guid.NewGuid().ToString()));
        builder.Services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        return builder.Build();
    }

    [Fact]
    public void PaymentConfig_RequiresAuthorization_AndIsNotAnonymous()
    {
        var app = CreateTestApp();

        var group = app.MapGroup("/api/v1");
        new BillingEndpoints().MapEndpoint(group);

        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(ds => ds.Endpoints)
            .OfType<RouteEndpoint>()
            .ToList();

        var paymentConfigEndpoint = endpoints.SingleOrDefault(e =>
            e.RoutePattern.RawText == "/api/v1/billing/payment-config");

        Assert.NotNull(paymentConfigEndpoint);
        Assert.Null(paymentConfigEndpoint.Metadata.GetMetadata<IAllowAnonymous>());
        Assert.NotEmpty(paymentConfigEndpoint.Metadata.GetOrderedMetadata<IAuthorizeData>());
    }

    [Fact]
    public void PublicConfig_AllowsAnonymous_AndIsUnderBilling()
    {
        var app = CreateTestApp();

        var group = app.MapGroup("/api/v1");
        new BillingEndpoints().MapEndpoint(group);

        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(ds => ds.Endpoints)
            .OfType<RouteEndpoint>()
            .ToList();

        var publicConfigEndpoint = endpoints.SingleOrDefault(e =>
            e.RoutePattern.RawText == "/api/v1/billing/public-config");

        Assert.NotNull(publicConfigEndpoint);
        Assert.NotNull(publicConfigEndpoint.Metadata.GetMetadata<IAllowAnonymous>());
    }

    [Fact]
    public async Task PublicConfig_ReturnsOnlyTrialDaysAndDefaultBillingCadence_NoBankAccountsOrTin()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var settingsService = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        var config = await settingsService.GetBillingPublicConfigAsync();

        Assert.Equal(14, config.TrialDays);
        Assert.Equal("monthly", config.DefaultBillingCadence);

        // Verification of data minimization: BillingPublicConfigDto has only 2 properties
        var properties = typeof(BillingPublicConfigDto).GetProperties();
        Assert.Equal(2, properties.Length);
        Assert.Contains(properties, p => p.Name == nameof(BillingPublicConfigDto.TrialDays));
        Assert.Contains(properties, p => p.Name == nameof(BillingPublicConfigDto.DefaultBillingCadence));
    }

    [Theory]
    [InlineData("30", 30)]
    [InlineData("7", 7)]
    [InlineData("0", 0)]
    public async Task PublicConfig_ReflectsSuperAdminUpdates_ImmediatelyViaCacheInvalidation(string newTrialDaysStr, int expectedDays)
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var settingsService = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        // Initial fetch seeds defaults
        var initial = await settingsService.GetBillingPublicConfigAsync();
        Assert.Equal(14, initial.TrialDays);

        // Super Admin updates platform settings
        await settingsService.UpdateSettingsAsync(
            new Dictionary<string, string> { ["Billing:TrialDays"] = newTrialDaysStr },
            "super_admin");

        // Next fetch must return updated trial days immediately (cache was evicted)
        var updated = await settingsService.GetBillingPublicConfigAsync();
        Assert.Equal(expectedDays, updated.TrialDays);
    }

    [Fact]
    public void PublicSettings_AllowsAnonymous_AndIsMappedCorrectly()
    {
        var app = CreateTestApp();

        var group = app.MapGroup("/api/v1");
        new PublicSettingsEndpoints().MapEndpoint(group);

        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(ds => ds.Endpoints)
            .OfType<RouteEndpoint>()
            .ToList();

        var publicSettingsEndpoint = endpoints.SingleOrDefault(e =>
            e.RoutePattern.RawText == "/api/v1/public/settings");

        Assert.NotNull(publicSettingsEndpoint);
        Assert.NotNull(publicSettingsEndpoint.Metadata.GetMetadata<IAllowAnonymous>());
    }

    [Fact]
    public async Task PublicSettings_ReturnsAppStoreUrls()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var settingsService = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        var apple = await settingsService.GetSettingValueAsync(
            "PatientApp:AppleAppStoreUrl",
            "https://apps.apple.com/app/clinicez-patient/id000000000");
        var google = await settingsService.GetSettingValueAsync(
            "PatientApp:GooglePlayStoreUrl",
            "https://play.google.com/store/apps/details?id=com.clinicez.patient");

        Assert.Contains("apps.apple.com", apple);
        Assert.Contains("play.google.com", google);
    }
}
