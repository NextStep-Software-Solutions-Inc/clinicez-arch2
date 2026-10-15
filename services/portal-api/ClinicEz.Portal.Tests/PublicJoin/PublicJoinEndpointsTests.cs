using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Security.ClaimTokens;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.PublicJoin;

public class PublicJoinEndpointsTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IInteropPublisher _publisher;
    private readonly SystemSettingsService _settingsService;
    private readonly FixedFrontendUrl _frontendUrlProvider;
    private readonly ClaimTokenService _claimTokenService;
    private readonly Tenant _tenant;
    private readonly Facility _clinic;

    public PublicJoinEndpointsTests()
    {
        _publisher = new InteropPublisher(_context);
        _settingsService = new SystemSettingsService(_context, new MemoryCache(new MemoryCacheOptions()), NullLogger<SystemSettingsService>.Instance);
        _frontendUrlProvider = new FixedFrontendUrl("https://portal.clinicez.test");
        _claimTokenService = new ClaimTokenService();

        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "metro-health",
            Name = "Metro Health",
            OwnerId = "owner-1",
            Email = "admin@metrohealth.ph"
        };

        _clinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "main-clinic",
            Name = "Metro Main Clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };

        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_clinic);
        _context.SaveChanges();

        // Clear setup messages (such as directory upserts) so tests only observe envelopes emitted by HandleAsync
        _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private static PatientJoinRequestedPayload CreateValidPayload(string? email = "patient@example.ph") => new()
    {
        TenantSlug = "metro-health",
        FacilitySlug = "main-clinic",
        JoinCode = "JOIN123",
        FirstName = "Juan",
        LastName = "Dela Cruz",
        ContactNumber = "09171234567",
        DateOfBirth = new DateOnly(1990, 5, 15),
        Sex = "M",
        Email = email,
        MemberType = "MM"
    };

    [Fact]
    public async Task HandleAsync_WithEmail_IssuesTokenAndEnqueuesEmailNotification_ZeroSms()
    {
        var payload = CreateValidPayload("juan@example.ph");

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var accepted = Assert.IsAssignableFrom<IValueHttpResult>(result);
        Assert.NotNull(accepted.Value);

        // Verify response contains trackingId, claimToken, expiresAt
        var valueType = accepted.Value.GetType();
        var successProp = valueType.GetProperty("Success")?.GetValue(accepted.Value);
        var claimTokenProp = valueType.GetProperty("ClaimToken")?.GetValue(accepted.Value) as string;
        var expiresAtProp = valueType.GetProperty("ExpiresAt")?.GetValue(accepted.Value);

        Assert.Equal(true, successProp);
        Assert.NotNull(claimTokenProp);
        Assert.NotNull(expiresAtProp);

        // Verify claimToken is cryptographically valid and contains matching claims
        var tokenValidation = _claimTokenService.ValidateToken(claimTokenProp);
        Assert.True(tokenValidation.IsValid);
        Assert.Equal("Juan", tokenValidation.Claims?.FirstName);
        Assert.Equal("Dela Cruz", tokenValidation.Claims?.LastName);
        Assert.Equal("juan@example.ph", tokenValidation.Claims?.Email);
        Assert.Equal("metro-health", tokenValidation.Claims?.TenantSlug);
        Assert.Equal("main-clinic", tokenValidation.Claims?.FacilitySlug);

        // Verify Outbox: exactly 2 envelopes (patient.join.requested + notification.email.requested)
        var allEnvelopes = TestSupport.Outbox(_context);
        Assert.Equal(2, allEnvelopes.Count);

        var joinEnvelope = Assert.Single(TestSupport.Outbox(_context, InteropTypes.PatientJoinRequested));
        Assert.Equal(Party.Portal, joinEnvelope.From);
        Assert.Equal(Party.ForFacility(_tenant.Id.ToString(), _clinic.Id.ToString(), FacilityType.Clinic), joinEnvelope.To);

        var emailEnvelope = Assert.Single(TestSupport.Outbox(_context, InteropTypes.NotificationEmailRequested));
        Assert.Equal(Party.Portal, emailEnvelope.From);
        Assert.Equal(Party.Portal, emailEnvelope.To);

        var emailPayload = emailEnvelope.GetPayload<NotificationEmailRequestedPayload>();
        Assert.Equal("juan@example.ph", emailPayload.To);
        Assert.Equal(EmailTemplateKeys.PatientClaimInvitation, emailPayload.TemplateKey);
        Assert.Contains("Metro Main Clinic", emailPayload.Subject);
        Assert.Equal("Juan Dela Cruz", emailPayload.Model["patientName"]);
        Assert.Equal("Metro Main Clinic", emailPayload.Model["facilityName"]);
        Assert.Contains("/join/claim?token=", emailPayload.Model["claimUrl"]);
        Assert.Contains(Uri.EscapeDataString(claimTokenProp), emailPayload.Model["claimUrl"]);

        // Explicitly verify ZERO SMS messages were dispatched
        var smsEnvelopes = allEnvelopes.Where(e => e.Type.Contains("sms", StringComparison.OrdinalIgnoreCase)).ToList();
        Assert.Empty(smsEnvelopes);
    }

    [Fact]
    public async Task HandleAsync_WithoutEmail_IssuesToken_DoesNotEnqueueEmail_ZeroSms()
    {
        var payload = CreateValidPayload(email: null);

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var accepted = Assert.IsAssignableFrom<IValueHttpResult>(result);
        Assert.NotNull(accepted.Value);

        var claimTokenProp = accepted.Value.GetType().GetProperty("ClaimToken")?.GetValue(accepted.Value) as string;
        Assert.NotNull(claimTokenProp);

        // Token is still generated for 1-click on-screen pass claiming
        var validation = _claimTokenService.ValidateToken(claimTokenProp);
        Assert.True(validation.IsValid);
        Assert.Null(validation.Claims?.Email);

        // Outbox contains ONLY patient.join.requested, NO email envelopes, NO SMS envelopes
        var allEnvelopes = TestSupport.Outbox(_context);
        Assert.Single(allEnvelopes);
        Assert.Equal(InteropTypes.PatientJoinRequested, allEnvelopes[0].Type);

        var emailEnvelopes = TestSupport.Outbox(_context, InteropTypes.NotificationEmailRequested);
        Assert.Empty(emailEnvelopes);

        var smsEnvelopes = allEnvelopes.Where(e => e.Type.Contains("sms", StringComparison.OrdinalIgnoreCase)).ToList();
        Assert.Empty(smsEnvelopes);
    }

    [Fact]
    public async Task HandleAsync_CustomTtlHours_AppliesToExpiresAt()
    {
        // Update TTL to 72 hours
        await _settingsService.UpdateSettingsAsync(new Dictionary<string, string>
        {
            ["JoinClaim:TtlHours"] = "72"
        }, "Admin");

        var payload = CreateValidPayload();
        var before = DateTime.UtcNow.AddHours(72).AddSeconds(-5);

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var accepted = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var expiresAt = (DateTime)accepted.Value!.GetType().GetProperty("ExpiresAt")!.GetValue(accepted.Value)!;
        var after = DateTime.UtcNow.AddHours(72).AddSeconds(5);

        Assert.InRange(expiresAt, before, after);
    }

    [Fact]
    public async Task HandleAsync_FutureDateOfBirth_ReturnsBadRequest()
    {
        var payload = CreateValidPayload();
        payload = payload with { DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)) };

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var statusCodeResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, statusCodeResult.StatusCode);
    }

    [Fact]
    public async Task HandleAsync_InvalidPhilHealthPin_ReturnsBadRequest()
    {
        var payload = CreateValidPayload();
        payload = payload with { PhilHealthPin = "12-345678901-0" }; // invalid check digit

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var statusCodeResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, statusCodeResult.StatusCode);
    }

    [Fact]
    public async Task HandleAsync_InactiveFacility_Returns503ServiceUnavailable()
    {
        _clinic.Status = FacilityStatus.Suspended;
        await _context.SaveChangesAsync();

        var payload = CreateValidPayload();

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var statusCodeResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, statusCodeResult.StatusCode);
    }

    [Fact]
    public void MapApiEndpoints_BuildsAllEndpointRequestDelegatesWithoutThrow()
    {
        var builder = Microsoft.AspNetCore.Builder.WebApplication.CreateBuilder();
        builder.Configuration["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=test;Username=postgres;Password=postgres";
        builder.Configuration["Clerk:Authority"] = "https://clerk.example.test";
        builder.Configuration["Clerk:SecretKey"] = "sk_test_dummy";
        builder.Configuration["Xendit:SecretKey"] = "xnd_test_dummy";
        builder.Configuration["Xendit:CallbackToken"] = "cb_test_dummy";
        builder.Configuration["ClaimToken:SigningKey"] = "test-claim-token-signing-key-32-bytes-minimum";

        ClinicEz.Portal.Api.DependencyInjection.AddApiServices(builder.Services);
        ClinicEz.Portal.Application.DependencyInjection.AddApplicationServices(builder.Services);
        ClinicEz.Portal.Infrastructure.DependencyInjection.AddInfrastructureServices(
            builder.Services,
            builder.Configuration,
            builder.Environment);

        using var app = builder.Build();
        ClinicEz.Portal.Api.Extensions.WebApplicationEndpointExtensions.MapApiEndpoints(app);

        var endpoints = ((Microsoft.AspNetCore.Routing.IEndpointRouteBuilder)app)
            .DataSources
            .SelectMany(ds => ds.Endpoints)
            .ToList();

        Assert.NotEmpty(endpoints);
        Assert.Contains(endpoints, e => e.DisplayName?.Contains("/api/v1/public/join") == true);
    }
}
