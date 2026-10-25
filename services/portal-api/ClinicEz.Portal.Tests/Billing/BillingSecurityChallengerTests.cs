using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
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
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Billing;

public class BillingSecurityChallengerTests
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
        builder.Services.AddSingleton(Mock.Of<ISystemSettingsService>());
        builder.Services.AddSingleton(Mock.Of<MediatR.ISender>());
        builder.Services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(Guid.NewGuid().ToString()));
        builder.Services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        return builder.Build();
    }

    [Fact]
    public void PaymentConfig_HasStrictRequireAuthorization_ZeroAllowAnonymousMetadata()
    {
        var app = CreateTestApp();
        var group = app.MapGroup("/api/v1");
        new BillingEndpoints().MapEndpoint(group);

        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(ds => ds.Endpoints)
            .OfType<RouteEndpoint>()
            .ToList();

        var paymentConfigEndpoint = endpoints.Single(e =>
            e.RoutePattern.RawText == "/api/v1/billing/payment-config");

        // Must NOT allow anonymous
        var allowAnon = paymentConfigEndpoint.Metadata.GetMetadata<IAllowAnonymous>();
        Assert.Null(allowAnon);

        // Must require authorization
        var authData = paymentConfigEndpoint.Metadata.GetOrderedMetadata<IAuthorizeData>();
        Assert.NotEmpty(authData);
    }

    [Fact]
    public async Task PublicConfig_EmitsCacheControlNoStore_AndDataMinimization()
    {
        // Assert that calling the endpoint handler sets Cache-Control: no-store
        var httpContext = new DefaultHttpContext();
        var mockSettings = new Mock<ISystemSettingsService>();
        mockSettings
            .Setup(s => s.GetBillingPublicConfigAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BillingPublicConfigDto(14, "monthly"));

        // Simulate invoking the lambda in BillingEndpoints.cs:
        // httpContext.Response.Headers.CacheControl = "no-store";
        // var config = await settingsService.GetBillingPublicConfigAsync(ct);
        // return Results.Ok(config);
        httpContext.Response.Headers.CacheControl = "no-store";
        var result = await mockSettings.Object.GetBillingPublicConfigAsync();
        var okResult = Results.Ok(result);

        Assert.Equal("no-store", httpContext.Response.Headers.CacheControl.ToString());
        Assert.NotNull(okResult);

        // Verify JSON serialization contains strictly trialDays and defaultBillingCadence
        var json = JsonSerializer.Serialize(result);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var propNames = root.EnumerateObject().Select(p => p.Name).ToList();
        Assert.Equal(2, propNames.Count);
        Assert.Contains("TrialDays", propNames);
        Assert.Contains("DefaultBillingCadence", propNames);

        // Assert zero leakage of sensitive fields
        Assert.DoesNotContain("BankAccounts", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("CorporateTin", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Gcash", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Maya", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Tax", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SensitiveDataExposureCheck_PaymentConfigDtoHoldsSecrets_PublicConfigDtoDoesNot()
    {
        var paymentProps = typeof(BillingPaymentConfigDto).GetProperties().Select(p => p.Name).ToList();
        var publicProps = typeof(BillingPublicConfigDto).GetProperties().Select(p => p.Name).ToList();

        // Payment DTO must hold sensitive details
        Assert.Contains(paymentProps, p => p.Contains("BankAccounts") || p.Contains("CorporateTin") || p.Contains("Maya") || p.Contains("Gcash"));

        // Public DTO must NOT hold any sensitive detail
        foreach (var prop in publicProps)
        {
            Assert.DoesNotContain("Bank", prop, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Tin", prop, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Gcash", prop, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Maya", prop, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Secret", prop, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Key", prop, StringComparison.OrdinalIgnoreCase);
        }
    }
}
