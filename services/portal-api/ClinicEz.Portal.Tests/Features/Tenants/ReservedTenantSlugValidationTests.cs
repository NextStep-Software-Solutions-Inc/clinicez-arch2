using System;
using System.Net;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Clerk.BackendAPI;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Features.Tenants;
using ClinicEz.Portal.Application.Features.Tenants.Commands.CreateTenant;
using ClinicEz.Portal.Application.Features.Tenants.Commands.RegisterTenant;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Tenants;

public class ReservedTenantSlugValidationTests
{
    private readonly CreateTenantCommandValidator _createValidator = new();
    private readonly RegisterTenantCommandValidator _registerValidator = new();

    private static CreateTenantCommand CreateCommand(string slug) =>
        new(
            OwnerId: "user_clerk_test",
            Name: "Test Medical Practice",
            TenantSlug: slug,
            TenantType: "Workplace",
            FirstName: "Maria",
            LastName: "Santos",
            Email: "maria@practice.ph");

    private static RegisterTenantCommand RegisterCommand(string slug) =>
        new(
            FirstName: "Maria",
            LastName: "Santos",
            Email: "maria@practice.ph",
            Password: "Password123!",
            Name: "Test Medical Practice",
            TenantSlug: slug,
            TenantType: "Workplace");

    [Theory]
    [InlineData("home")]
    [InlineData("www")]
    [InlineData("portal")]
    [InlineData("admin")]
    [InlineData("app")]
    [InlineData("api")]
    [InlineData("clinic")]
    [InlineData("lab")]
    [InlineData("pharmacy")]
    [InlineData("portal-api")]
    [InlineData("HOME")]
    [InlineData("Portal")]
    public void ReservedSlugs_AreRejected_ByBothCreateAndRegisterValidators(string slug)
    {
        var createResult = _createValidator.Validate(CreateCommand(slug));
        Assert.False(createResult.IsValid);
        Assert.Contains(
            createResult.Errors,
            e => e.PropertyName == nameof(CreateTenantCommand.TenantSlug) &&
                 e.ErrorMessage == ReservedTenantSlugs.ReservedSlugMessage);

        var registerResult = _registerValidator.Validate(RegisterCommand(slug));
        Assert.False(registerResult.IsValid);
        Assert.Contains(
            registerResult.Errors,
            e => e.PropertyName == nameof(RegisterTenantCommand.TenantSlug) &&
                 e.ErrorMessage == ReservedTenantSlugs.ReservedSlugMessage);
    }

    [Theory]
    [InlineData("-leading")]
    [InlineData("trailing-")]
    [InlineData("double--hyphen")]
    [InlineData("UpperCase")]
    [InlineData("bad.dot")]
    [InlineData("bad/slash")]
    public void MalformedSlugs_AreRejected_ByBothCreateAndRegisterValidators(string slug)
    {
        var createResult = _createValidator.Validate(CreateCommand(slug));
        Assert.False(createResult.IsValid);
        Assert.Contains(createResult.Errors, e => e.PropertyName == nameof(CreateTenantCommand.TenantSlug));

        var registerResult = _registerValidator.Validate(RegisterCommand(slug));
        Assert.False(registerResult.IsValid);
        Assert.Contains(registerResult.Errors, e => e.PropertyName == nameof(RegisterTenantCommand.TenantSlug));
    }

    [Fact]
    public void SixtyFourCharSlug_IsRejected_ByBothCreateAndRegisterValidators()
    {
        var tooLongSlug = new string('a', 64);

        var createResult = _createValidator.Validate(CreateCommand(tooLongSlug));
        Assert.False(createResult.IsValid);
        Assert.Contains(createResult.Errors, e => e.PropertyName == nameof(CreateTenantCommand.TenantSlug));

        var registerResult = _registerValidator.Validate(RegisterCommand(tooLongSlug));
        Assert.False(registerResult.IsValid);
        Assert.Contains(registerResult.Errors, e => e.PropertyName == nameof(RegisterTenantCommand.TenantSlug));
    }

    [Theory]
    [InlineData("st-lukes")]
    [InlineData("makati-med-center")]
    [InlineData("metrohealth1")]
    public void ValidSlugs_AreAccepted_ByBothCreateAndRegisterValidators(string slug)
    {
        var createResult = _createValidator.Validate(CreateCommand(slug));
        Assert.True(createResult.IsValid);

        var registerResult = _registerValidator.Validate(RegisterCommand(slug));
        Assert.True(registerResult.IsValid);
    }

    [Fact]
    public void SixtyThreeCharSlug_IsAccepted_ByBothValidatorsAndDnsHelper()
    {
        var maxValidSlug = new string('a', ReservedTenantSlugs.MaxSlugLength);

        Assert.True(ReservedTenantSlugs.IsValidDnsLabel(maxValidSlug));
        Assert.False(ReservedTenantSlugs.IsValidDnsLabel(maxValidSlug + "a"));

        Assert.True(_createValidator.Validate(CreateCommand(maxValidSlug)).IsValid);
        Assert.True(_registerValidator.Validate(RegisterCommand(maxValidSlug)).IsValid);
    }

    [Fact]
    public void AllCanonicalReservedSubdomains_ArePresentAndCaseInsensitive()
    {
        string[] expected =
        [
            "home", "www", "portal", "admin", "app", "api", "dev", "stage", "staging", "prod", "production", "test",
            "clinic", "clinics", "lab", "laboratory", "laboratories", "pharmacy", "pharmacies", "org", "organization",
            "organizations", "cashier", "patient", "patients", "hub", "interop", "interop-hub", "billing",
            "billing-api", "portal-api", "clinic-api", "laboratory-api", "pharmacy-api", "organization-api",
            "patient-api", "comms-api", "media-broker", "philhealth", "philhealth-proxy", "clerk", "auth", "login",
            "mail", "smtp", "imap", "pop", "cdn", "static", "assets", "media", "files", "docs", "status", "support",
            "help", "blog", "blogs", "marketing", "go", "web", "site", "dashboard", "console", "workspace", "root",
            "localhost"
        ];

        foreach (var slug in expected)
        {
            Assert.Contains(slug, ReservedTenantSlugs.All);
            Assert.True(ReservedTenantSlugs.IsReserved(slug));
            Assert.True(ReservedTenantSlugs.IsReserved(slug.ToUpperInvariant()));
            Assert.True(ReservedTenantSlugs.IsReserved($"  {slug}  "));
        }

        Assert.False(ReservedTenantSlugs.IsReserved(null));
        Assert.False(ReservedTenantSlugs.IsReserved(""));
        Assert.False(ReservedTenantSlugs.IsReserved("   "));
        Assert.False(ReservedTenantSlugs.IsReserved("st-lukes"));
    }

    [Theory]
    [InlineData("home")]
    [InlineData("portal")]
    [InlineData("ADMIN")]
    public async Task CreateAndRegisterHandlers_DefenseInDepth_ThrowValidationExceptionForReservedSlugs(string reservedSlug)
    {
        using var context = TestSupport.NewContext();
        TestSupport.Entitlements(context);

        var subscriptions = new SubscriptionService(
            context,
            Options.Create(TestSupport.Plans()),
            TimeProvider.System,
            new Mock<IEntitlementsPublisher>().Object);

        var createHandler = new CreateTenantCommandHandler(
            context,
            TestSupport.OwnershipPolicy(context),
            subscriptions,
            TestSupport.NoClerkSync(),
            TimeProvider.System);

        var createEx = await Assert.ThrowsAsync<ValidationException>(() =>
            createHandler.Handle(CreateCommand(reservedSlug), CancellationToken.None));
        Assert.Contains("reserved by Clinic EZ", createEx.Message);
        Assert.Empty(context.Tenants);

        var registerHandler = new RegisterTenantCommandHandler(
            new ClerkBackendApi(bearerAuth: "sk_test_unused"),
            context,
            subscriptions,
            TestSupport.NoClerkSync(),
            TimeProvider.System);

        var registerEx = await Assert.ThrowsAsync<ValidationException>(() =>
            registerHandler.Handle(RegisterCommand(reservedSlug), CancellationToken.None));
        Assert.Contains("reserved by Clinic EZ", registerEx.Message);
        Assert.Empty(context.Tenants);
    }

    [Theory]
    [InlineData("home")]
    [InlineData("portal")]
    [InlineData("www")]
    [InlineData("admin")]
    [InlineData("HOME")]
    [InlineData("Portal")]
    public async Task LookupTenantEndpoint_ReservedSlug_Returns404WithSlugReservedCode(string slug)
    {
        var dbName = Guid.NewGuid().ToString();
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRouting();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        builder.Services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());

        await using var app = builder.Build();
        app.UseRouting();
        new LookupTenantEndpoint().MapEndpoint(app);
        await app.StartAsync();

        var client = app.GetTestClient();
        var response = await client.GetAsync($"/tenants/lookup/{slug}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.False(root.GetProperty("exists").GetBoolean());
        Assert.True(root.GetProperty("isReserved").GetBoolean());
        Assert.Equal("slug_reserved", root.GetProperty("code").GetString());
        Assert.Contains(slug, root.GetProperty("message").GetString());
    }

    [Fact]
    public async Task LookupTenantEndpoint_ExistingValidSlugAndMissingSlug_PreserveStandardBehavior()
    {
        var dbName = Guid.NewGuid().ToString();
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRouting();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        builder.Services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());

        await using var app = builder.Build();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Tenants.Add(new Tenant
            {
                Id = Guid.NewGuid(),
                TenantSlug = "st-lukes",
                Name = "St. Luke's Medical",
                OwnerId = "owner_st_lukes",
                Email = "admin@stlukes.ph"
            });
            await db.SaveChangesAsync();
        }

        app.UseRouting();
        new LookupTenantEndpoint().MapEndpoint(app);
        await app.StartAsync();

        var client = app.GetTestClient();

        var foundRes = await client.GetAsync("/tenants/lookup/st-lukes");
        Assert.Equal(HttpStatusCode.OK, foundRes.StatusCode);
        using (var foundDoc = JsonDocument.Parse(await foundRes.Content.ReadAsStringAsync()))
        {
            Assert.True(foundDoc.RootElement.GetProperty("exists").GetBoolean());
            Assert.Equal("st-lukes", foundDoc.RootElement.GetProperty("tenantSlug").GetString());
        }

        var missingRes = await client.GetAsync("/tenants/lookup/makati-med-center");
        Assert.Equal(HttpStatusCode.NotFound, missingRes.StatusCode);
        using (var missingDoc = JsonDocument.Parse(await missingRes.Content.ReadAsStringAsync()))
        {
            Assert.False(missingDoc.RootElement.GetProperty("exists").GetBoolean());
            Assert.False(missingDoc.RootElement.TryGetProperty("isReserved", out _));
        }
    }
}
