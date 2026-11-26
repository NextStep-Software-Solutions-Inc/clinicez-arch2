using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Hub;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Persistence.Interceptors;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interop.Requests;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Api.Tests;

public sealed class PatientIdentityDirectoryApiTests : IAsyncLifetime
{
    private WebApplication _app = null!;
    private HttpClient _client = null!;
    private readonly Mock<IInteropRequestClient> _interop = new();

    private const string MigrationsAdminClerkId = "user_admin_migrations_1e";
    private const string ViewerOnlyClerkId = "user_admin_viewer_1e";

    public async Task InitializeAsync()
    {
        var dbName = $"portal-patient-id-tests-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();

        builder.Services.AddAuthentication(o =>
            {
                o.DefaultAuthenticateScheme = TestHeaderAuthHandler.SchemeName;
                o.DefaultChallengeScheme = TestHeaderAuthHandler.SchemeName;
            })
            .AddScheme<AuthenticationSchemeOptions, TestHeaderAuthHandler>(TestHeaderAuthHandler.SchemeName, null);

        builder.Services.AddAuthorization();
        builder.Services.AddApiServices();
        builder.Services.AddApplicationServices();
        builder.Services.AddOptions<HubOptions>();
        builder.Services.AddSingleton<IFacilityLinkService, SameBranchFacilityLinkService>();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<FacilityDirectoryInterceptor>();

        builder.Services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        builder.Services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        builder.Services.AddScoped<IInteropDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        builder.Services.AddScoped<IInteropPublisher, InteropPublisher>();
        builder.Services.AddScoped<IHubDirectoryResyncService, HubDirectoryResyncService>();
        builder.Services.AddScoped<IDirectoryVerificationSyncService, DirectoryVerificationSyncService>();
        builder.Services.AddSingleton<IPortalEvidenceStorageService>(Mock.Of<IPortalEvidenceStorageService>());
        builder.Services.AddSingleton(_interop.Object);
        builder.Services.AddSingleton(Mock.Of<IEntitlementGuard>());
        builder.Services.AddSingleton(Mock.Of<IEntitlementService>());
        builder.Services.AddSingleton(Mock.Of<IFacilityAllocationService>());
        builder.Services.AddSingleton(Mock.Of<ILicenseIssuer>());
        builder.Services.AddSingleton(Mock.Of<IHubOnboardingService>());

        _app = builder.Build();
        _app.UseExceptionHandler();
        _app.UseAuthentication();
        _app.UseAuthorization();
        var apiGroup = _app.MapGroup("/api/v1");
        new AdminEndpoints().MapEndpoint(apiGroup);
        await _app.StartAsync();
        _client = _app.GetTestClient();

        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var migRole = new AdminRole
        {
            Id = Guid.NewGuid(),
            Name = "MigrationOperator",
            Description = "Can manage migrations",
            Permissions = new List<string> { Permissions.ManageMigrations }
        };
        var viewerRole = new AdminRole
        {
            Id = Guid.NewGuid(),
            Name = "AnalyticsViewer",
            Description = "Read only analytics",
            Permissions = new List<string> { Permissions.ViewAnalytics }
        };
        db.AdminRoles.AddRange(migRole, viewerRole);
        db.AdminUsers.AddRange(
            new AdminUser
            {
                Id = Guid.NewGuid(),
                ClerkUserId = MigrationsAdminClerkId,
                Email = "mig.admin@clinicez.ph",
                FullName = "Migration Admin",
                RoleId = migRole.Id,
                IsActive = true
            },
            new AdminUser
            {
                Id = Guid.NewGuid(),
                ClerkUserId = ViewerOnlyClerkId,
                Email = "viewer@clinicez.ph",
                FullName = "Viewer Only",
                RoleId = viewerRole.Id,
                IsActive = true
            });
        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _app.DisposeAsync();
    }

    [Fact]
    public async Task GetPatientIdentities_DeniesAdminWithoutMigrationOrAdminPermission()
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/patient-identities");
        req.Headers.Add("X-Test-User", ViewerOnlyClerkId);

        var res = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task GetPatientIdentities_RoutesStrictlyThroughInteropHubToPatientPlane()
    {
        var sampleId = Guid.NewGuid();
        _interop.Setup(c => c.RequestAsync<PatientIdentityDirectoryRequestedPayload, PatientIdentityDirectoryRespondedPayload>(
                InteropTypes.PatientIdentityDirectoryRequested,
                InteropTypes.PatientIdentityDirectoryResponded,
                Party.Portal,
                Party.PatientPlane,
                It.Is<PatientIdentityDirectoryRequestedPayload>(p =>
                    p.Search == "CE-1234" && p.StatusFilter == "UNLINKED" && p.Limit == 10 && p.Offset == 5),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PatientIdentityDirectoryRespondedPayload
            {
                Succeeded = true,
                Summary = new PatientIdentityDirectorySummaryPayload
                {
                    TotalPrimaryPatients = 100,
                    ClerkLinkedCount = 70,
                    UnlinkedCount = 30,
                    ReclaimedViaEmailCount = 12,
                    AmbiguousDuplicateEmailGroups = 1,
                    AmbiguousDuplicatePatientCount = 2
                },
                TotalMatching = 1,
                Limit = 10,
                Offset = 5,
                Items =
                [
                    new PatientIdentityDirectoryItemPayload
                    {
                        PatientId = sampleId,
                        ClinicEzId = "CE-1234-ABCD",
                        FirstName = "Synth",
                        LastName = "Patient",
                        Email = "synth@example.test",
                        ClerkUserId = null,
                        IdentityStatus = PatientIdentityStatus.Unlinked,
                        DuplicateEmailCount = 1,
                        CreatedAtUtc = DateTime.UtcNow
                    }
                ]
            });

        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/patient-identities?search=CE-1234&status=UNLINKED&limit=10&offset=5");
        req.Headers.Add("X-Test-User", MigrationsAdminClerkId);

        var res = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var body = await res.Content.ReadFromJsonAsync<PatientIdentityDirectoryRespondedPayload>();
        Assert.NotNull(body);
        Assert.Equal(100, body.Summary.TotalPrimaryPatients);
        Assert.Equal(30, body.Summary.UnlinkedCount);
        Assert.Single(body.Items);
        Assert.Equal("CE-1234-ABCD", body.Items[0].ClinicEzId);
    }

    [Fact]
    public async Task ReconcilePatientIdentity_MapsConflictAndTimeoutCleanly()
    {
        var patientId = Guid.NewGuid();

        _interop.Setup(c => c.RequestAsync<PatientIdentityReconcileRequestedPayload, PatientIdentityReconcileRespondedPayload>(
                InteropTypes.PatientIdentityReconcileRequested,
                InteropTypes.PatientIdentityReconcileResponded,
                Party.Portal,
                Party.PatientPlane,
                It.Is<PatientIdentityReconcileRequestedPayload>(p =>
                    p.PatientId == patientId && p.Action == "BIND_CLERK" && p.ClerkUserId == "user_dup" && p.Actor == "mig.admin@clinicez.ph"),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PatientIdentityReconcileRespondedPayload
            {
                Succeeded = false,
                ErrorCode = "CONFLICT",
                Error = "Clerk user already bound."
            });

        using var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/admin/patient-identities/{patientId}/reconcile")
        {
            Content = JsonContent.Create(new ReconcilePatientIdentityHttpRequest("BIND_CLERK", "user_dup", "test"))
        };
        req.Headers.Add("X-Test-User", MigrationsAdminClerkId);

        var res = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

        // Interop Hub timeout -> 503 ServiceUnavailable
        _interop.Setup(c => c.RequestAsync<PatientIdentityDirectoryRequestedPayload, PatientIdentityDirectoryRespondedPayload>(
                InteropTypes.PatientIdentityDirectoryRequested,
                InteropTypes.PatientIdentityDirectoryResponded,
                Party.Portal,
                Party.PatientPlane,
                It.IsAny<PatientIdentityDirectoryRequestedPayload>(),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InteropRequestTimeoutException(InteropTypes.PatientIdentityDirectoryRequested, Guid.NewGuid(), TimeSpan.FromSeconds(15)));

        using var reqTimeout = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/patient-identities");
        reqTimeout.Headers.Add("X-Test-User", MigrationsAdminClerkId);
        var resTimeout = await _client.SendAsync(reqTimeout);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, resTimeout.StatusCode);
    }

    private sealed class TestHeaderAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "TestHeader1E";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-User", out var values) || string.IsNullOrWhiteSpace(values.ToString()))
                return Task.FromResult(AuthenticateResult.NoResult());

            var claims = new[] { new Claim(ClaimTypes.NameIdentifier, values.ToString()) };
            var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
        }
    }
}
