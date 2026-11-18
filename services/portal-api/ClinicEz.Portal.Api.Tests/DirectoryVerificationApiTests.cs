using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Services;
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
using ClinicEz.Portal.Infrastructure.Persistence.Seeders;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Api.Tests;

public sealed class DirectoryVerificationApiTests : IAsyncLifetime
{
    private WebApplication _app = null!;
    private HttpClient _client = null!;
    private string _dbName = null!;
    private Guid _tenantId;
    private Guid _facilityId;
    private Guid _facReqId;
    private Guid _pracReqAwaitingOtpId;
    private const string ConfirmToken = "confirm-token-secret-2026";
    private const string ConfirmOtp = "654321";

    public async Task InitializeAsync()
    {
        _dbName = $"portal-api-tests-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Storage:BasePath"] = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"clinicez-portal-test-storage-{Guid.NewGuid():N}")
        });

        builder.Services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = HeaderTestAuthHandler.SchemeName;
                options.DefaultChallengeScheme = HeaderTestAuthHandler.SchemeName;
            })
            .AddScheme<AuthenticationSchemeOptions, HeaderTestAuthHandler>(HeaderTestAuthHandler.SchemeName, null);

        builder.Services.AddAuthorization();
        builder.Services.AddApiServices();
        builder.Services.AddApplicationServices();
        builder.Services.AddOptions<HubOptions>();
        builder.Services.AddSingleton<IFacilityLinkService, SameBranchFacilityLinkService>();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<FacilityDirectoryInterceptor>();

        builder.Services.AddDbContext<ApplicationDbContext>(options =>
            options.UseInMemoryDatabase(_dbName));
        builder.Services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        builder.Services.AddScoped<IInteropDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        builder.Services.AddScoped<IInteropPublisher, InteropPublisher>();
        builder.Services.AddScoped<IFacilityProvisioningPublisher, FacilityProvisioningPublisher>();
        builder.Services.AddScoped<IHubDirectoryResyncService, HubDirectoryResyncService>();
        builder.Services.AddScoped<IDirectoryVerificationSyncService, DirectoryVerificationSyncService>();
        builder.Services.AddScoped<IPortalEvidenceStorageService, LocalPortalEvidenceStorageService>();
        builder.Services.AddSingleton(Mock.Of<IEntitlementGuard>());
        builder.Services.AddSingleton(Mock.Of<IEntitlementService>());
        builder.Services.AddSingleton(Mock.Of<IFacilityAllocationService>());
        builder.Services.AddSingleton(Mock.Of<ILicenseIssuer>());
        builder.Services.AddSingleton(Mock.Of<IHubOnboardingService>());

        _app = builder.Build();
        _app.UseExceptionHandler();
        _app.UseAuthentication();
        _app.UseAuthorization();
        _app.UseRateLimiter();
        var apiGroup = _app.MapGroup("/api/v1");
        new AdminEndpoints().MapEndpoint(apiGroup);
        new FacilityEndpoints().MapEndpoint(apiGroup);
        new PublicDirectoryEndpoints().MapEndpoint(apiGroup);
        await _app.StartAsync();

        _client = _app.GetTestClient();
        await SeedTestDataAsync();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    private async Task SeedTestDataAsync()
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await new AdminRBACSeeder(db).SeedAsync();

        var superAdminRoleId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var supportRoleId = Guid.Parse("55555555-5555-5555-5555-555555555555");
        var verifierRoleId = Guid.Parse("67777777-7777-7777-7777-777777777777");

        db.AdminUsers.AddRange(
            new AdminUser
            {
                Id = Guid.NewGuid(),
                ClerkUserId = "clerk_super_admin",
                Email = "super@clinicez.ph",
                FullName = "Super Admin",
                RoleId = superAdminRoleId,
                IsActive = true,
                Status = AdminUserStatus.Active
            },
            new AdminUser
            {
                Id = Guid.NewGuid(),
                ClerkUserId = "clerk_verifier",
                Email = "verifier@clinicez.ph",
                FullName = "Directory Verifier",
                RoleId = verifierRoleId,
                IsActive = true,
                Status = AdminUserStatus.Active
            },
            new AdminUser
            {
                Id = Guid.NewGuid(),
                ClerkUserId = "clerk_support",
                Email = "support@clinicez.ph",
                FullName = "Support Operator",
                RoleId = supportRoleId,
                IsActive = true,
                Status = AdminUserStatus.Active
            });

        _tenantId = Guid.NewGuid();
        _facilityId = Guid.NewGuid();
        _facReqId = Guid.NewGuid();
        _pracReqAwaitingOtpId = Guid.NewGuid();

        var tenant = new Tenant
        {
            Id = _tenantId,
            TenantSlug = "manila-care",
            Name = "Manila Care Network",
            OwnerId = "clerk_clinic_owner",
            Email = "owner@manilacare.ph"
        };
        var facility = new Facility
        {
            Id = _facilityId,
            TenantId = _tenantId,
            Name = "Manila Care Ermita",
            Slug = "manila-care-ermita",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = true,
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview,
            LtoEvidenceObjectKey = "verification/lto/ermita-lto.pdf",
            LatestVerificationRequestId = _facReqId
        };

        var facilityPayload = new FacilityVerificationRequestedPayload
        {
            RequestId = _facReqId,
            TenantId = _tenantId.ToString(),
            FacilityId = _facilityId,
            FacilityName = facility.Name,
            FacilitySlug = facility.Slug,
            DohLtoNumber = "DOH-LTO-9988",
            LtoEvidenceObjectKey = "verification/lto/ermita-lto.pdf",
            RequestKind = "Initial",
            SubmittedByClinicUserId = "clerk_clinic_owner",
            SubmittedByDisplayName = "Clinic Owner",
            SubmittedAtUtc = DateTime.UtcNow.AddMinutes(-10)
        };

        var facReq = new FacilityVerificationRequest
        {
            Id = _facReqId,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            SubmissionNumber = 1,
            CorrelationId = _facReqId.ToString(),
            RequestKind = "Initial",
            SubmittedByClinicUserId = "clerk_clinic_owner",
            SubmittedByDisplayName = "Clinic Owner",
            SubmittedAtUtc = facilityPayload.SubmittedAtUtc,
            SubmittedSnapshotJson = JsonSerializer.Serialize(facilityPayload, InteropJson.Options),
            LtoEvidenceObjectKey = "verification/lto/ermita-lto.pdf",
            Status = "PendingReview"
        };

        var childDocId = Guid.NewGuid();
        var childSnap = new PractitionerRequestSnapshot(
            childDocId,
            _facilityId,
            facility.Name,
            Guid.NewGuid(),
            "Initial",
            "Doctor",
            "Jose",
            "Rizal",
            "Dr.",
            "0088112",
            "0088112",
            new DateOnly(2028, 6, 30),
            "verification/prc/rizal.pdf",
            "jose.rizal@manilacare.ph",
            "Family Medicine",
            "Primary care physician",
            null,
            Array.Empty<ProviderAvailabilityWindowDto>(),
            "clerk_clinic_owner",
            facilityPayload.SubmittedAtUtc);

        var childPracReq = new PractitionerVerificationRequest
        {
            Id = childDocId,
            FacilityVerificationRequestId = _facReqId,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            ClinicStaffMemberId = childSnap.ClinicStaffMemberId,
            SubmissionNumber = 1,
            CorrelationId = _facReqId.ToString(),
            RequestKind = "Initial",
            ProfessionKind = "Doctor",
            SubmittedPrcLicenseNo = "0088112",
            NormalizedPrcLicenseNo = "0088112",
            PrcExpiryDate = new DateOnly(2028, 6, 30),
            SubmittedSnapshotJson = JsonSerializer.Serialize(childSnap, InteropJson.Options),
            PrcEvidenceObjectKey = "verification/prc/rizal.pdf",
            VerificationContact = "jose.rizal@manilacare.ph",
            SubmittedByClinicUserId = "clerk_clinic_owner",
            SubmittedAtUtc = facilityPayload.SubmittedAtUtc,
            Status = "PendingReview"
        };

        var existingVerifiedPrac = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Nurse",
            NormalizedPrcLicenseNo = "0554433",
            DisplayPrcLicenseNo = "0554433",
            FirstName = "Clara",
            LastName = "Mendoza",
            Title = "RN",
            PrimarySpecialty = "Outpatient Nursing",
            VerificationStatus = PractitionerVerificationLevel.Verified,
            VerifiedAtUtc = DateTime.UtcNow.AddDays(-5)
        };

        var awaitingSnap = new PractitionerRequestSnapshot(
            _pracReqAwaitingOtpId,
            _facilityId,
            facility.Name,
            Guid.NewGuid(),
            "Affiliation",
            "Nurse",
            "Clara",
            "Mendoza",
            "RN",
            "0554433",
            "0554433",
            new DateOnly(2028, 8, 1),
            "verification/prc/clara.pdf",
            "clara.mendoza@manilacare.ph",
            "Outpatient Nursing",
            null,
            null,
            Array.Empty<ProviderAvailabilityWindowDto>(),
            "clerk_clinic_owner",
            DateTime.UtcNow.AddMinutes(-5),
            OtpCodeHash: DirectoryVerificationHelper.HashSecret(ConfirmOtp));

        var awaitingReq = new PractitionerVerificationRequest
        {
            Id = _pracReqAwaitingOtpId,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            ClinicStaffMemberId = awaitingSnap.ClinicStaffMemberId,
            PractitionerId = existingVerifiedPrac.Id,
            SubmissionNumber = 1,
            CorrelationId = _pracReqAwaitingOtpId.ToString(),
            RequestKind = "Affiliation",
            ProfessionKind = "Nurse",
            SubmittedPrcLicenseNo = "0554433",
            NormalizedPrcLicenseNo = "0554433",
            PrcExpiryDate = new DateOnly(2028, 8, 1),
            SubmittedSnapshotJson = JsonSerializer.Serialize(awaitingSnap, InteropJson.Options),
            PrcEvidenceObjectKey = "verification/prc/clara.pdf",
            VerificationContact = "clara.mendoza@manilacare.ph",
            SubmittedByClinicUserId = "clerk_clinic_owner",
            SubmittedAtUtc = DateTime.UtcNow.AddMinutes(-5),
            OtpTokenHash = DirectoryVerificationHelper.HashSecret(ConfirmToken),
            OtpExpiresAtUtc = DateTime.UtcNow.AddHours(24),
            Status = "AwaitingOtp"
        };

        db.Tenants.Add(tenant);
        db.Facilities.Add(facility);
        db.FacilityVerificationRequests.Add(facReq);
        db.Practitioners.Add(existingVerifiedPrac);
        db.PractitionerVerificationRequests.AddRange(childPracReq, awaitingReq);
        await db.SaveChangesAsync();
    }

    private HttpRequestMessage AsUser(HttpMethod method, string path, string? clerkUserId, string? email = null)
    {
        var req = new HttpRequestMessage(method, path);
        if (!string.IsNullOrEmpty(clerkUserId))
        {
            req.Headers.Add(HeaderTestAuthHandler.UserHeader, clerkUserId);
            if (!string.IsNullOrEmpty(email))
                req.Headers.Add(HeaderTestAuthHandler.EmailHeader, email);
        }
        return req;
    }

    [Fact]
    public async Task AdminVerificationQueueAndReviewEndpoints_EnforceRbacAndProcessWorkflow()
    {
        // 1. Unauthenticated -> 401
        var unauth = await _client.GetAsync("/api/v1/admin/verification-queue");
        Assert.Equal(HttpStatusCode.Unauthorized, unauth.StatusCode);

        // 2. Support Staff (no view:verifications) -> 403
        var supportRes = await _client.SendAsync(AsUser(HttpMethod.Get, "/api/v1/admin/verification-queue", "clerk_support"));
        Assert.Equal(HttpStatusCode.Forbidden, supportRes.StatusCode);

        // 3. Directory Verifier -> 200 on queue + detail
        var queueRes = await _client.SendAsync(AsUser(HttpMethod.Get, "/api/v1/admin/verification-queue?kind=facility&status=PendingReview", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, queueRes.StatusCode);
        var queueJson = await queueRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, queueJson.GetProperty("totalCount").GetInt32());

        var detailRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{_facReqId}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, detailRes.StatusCode);
        var detailJson = await detailRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("verification/lto/ermita-lto.pdf", detailJson.GetProperty("evidenceObjectKey").GetString());
        Assert.Equal(1, detailJson.GetProperty("childPractitionerRequests").GetArrayLength());

        // 4. Before approval, public directory clinics excludes unverified facility
        var pubBefore = await _client.GetFromJsonAsync<JsonElement>("/api/v1/public/directory/clinics");
        Assert.Equal(0, pubBefore.GetProperty("data").GetArrayLength());

        // 5. Reject without reason -> 400
        var emptyRejectReq = AsUser(HttpMethod.Post, $"/api/v1/admin/verification-queue/{_facReqId}/reject", "clerk_verifier");
        emptyRejectReq.Content = JsonContent.Create(new { reason = "   " });
        var emptyRejectRes = await _client.SendAsync(emptyRejectReq);
        Assert.Equal(HttpStatusCode.BadRequest, emptyRejectRes.StatusCode);

        // 6. Approve facility request by Directory Verifier -> 200
        var approveReq = AsUser(HttpMethod.Post, $"/api/v1/admin/verification-queue/{_facReqId}/approve", "clerk_verifier");
        approveReq.Content = JsonContent.Create(new { notes = "Verified LTO & PRC" });
        var approveRes = await _client.SendAsync(approveReq);
        Assert.Equal(HttpStatusCode.OK, approveRes.StatusCode);
        var approveJson = await approveRes.Content.ReadFromJsonAsync<JsonElement>();
        var approvedPracId = approveJson.GetProperty("approvedPractitionerIds")[0].GetGuid();

        // Duplicate approve -> 409
        var dupRes = await _client.SendAsync(AsUser(HttpMethod.Post, $"/api/v1/admin/verification-queue/{_facReqId}/approve", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.Conflict, dupRes.StatusCode);

        // After approval, public directory clinics & providers include the verified clinic and Dr. Jose Rizal
        var pubClinics = await _client.GetFromJsonAsync<JsonElement>("/api/v1/public/directory/clinics");
        Assert.Equal(1, pubClinics.GetProperty("data").GetArrayLength());
        var pubProviders = await _client.GetFromJsonAsync<JsonElement>("/api/v1/public/directory/providers");
        Assert.Equal(1, pubProviders.GetProperty("data").GetArrayLength());

        // 7. Directory Verifier lacks verify:revoke -> 403 on suspend; Super Admin -> 200
        var verifierSuspend = await _client.SendAsync(AsUser(HttpMethod.Post, $"/api/v1/admin/practitioners/{approvedPracId}/suspend", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.Forbidden, verifierSuspend.StatusCode);

        var superSuspendReq = AsUser(HttpMethod.Post, $"/api/v1/admin/practitioners/{approvedPracId}/suspend", "clerk_super_admin");
        superSuspendReq.Content = JsonContent.Create(new { reason = "License suspended" });
        var superSuspendRes = await _client.SendAsync(superSuspendReq);
        Assert.Equal(HttpStatusCode.OK, superSuspendRes.StatusCode);

        // 8. Resync endpoint by Super Admin -> 200
        var resyncRes = await _client.SendAsync(AsUser(HttpMethod.Post, "/api/v1/admin/hub/resync", "clerk_super_admin"));
        Assert.Equal(HttpStatusCode.OK, resyncRes.StatusCode);
    }

    [Fact]
    public async Task FacilityVerificationStatusAndLtoProofUploadEndpoints_WorkEndToEnd()
    {
        var statusRes = await _client.SendAsync(AsUser(
            HttpMethod.Get,
            $"/api/v1/facilities/{_facilityId}/verification-status?tenantSlug=manila-care",
            "clerk_clinic_owner"));
        Assert.Equal(HttpStatusCode.OK, statusRes.StatusCode);
        var statusJson = await statusRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("PendingReview", statusJson.GetProperty("platformVerificationStatus").GetString());
        Assert.Equal("verification/lto/ermita-lto.pdf", statusJson.GetProperty("ltoEvidenceObjectKey").GetString());

        // Invalid MIME type -> 415
        using var badContent = new MultipartFormDataContent();
        var txtBytes = new ByteArrayContent("plain text"u8.ToArray());
        txtBytes.Headers.ContentType = MediaTypeHeaderValue.Parse("text/plain");
        badContent.Add(txtBytes, "file", "notes.txt");
        var badReq = AsUser(HttpMethod.Post, $"/api/v1/facilities/{_facilityId}/lto-proof?tenantSlug=manila-care", "clerk_clinic_owner");
        badReq.Content = badContent;
        var badRes = await _client.SendAsync(badReq);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, badRes.StatusCode);

        // Valid PDF magic bytes -> 200 with stored objectKey
        using var pdfForm = new MultipartFormDataContent();
        var pdfBytes = new ByteArrayContent("%PDF-1.4\n%test"u8.ToArray());
        pdfBytes.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
        pdfForm.Add(pdfBytes, "file", "doh-lto.pdf");
        var okReq = AsUser(HttpMethod.Post, $"/api/v1/facilities/{_facilityId}/lto-proof?tenantSlug=manila-care", "clerk_clinic_owner");
        okReq.Content = pdfForm;
        var okRes = await _client.SendAsync(okReq);
        Assert.Equal(HttpStatusCode.OK, okRes.StatusCode);
        var okJson = await okRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.StartsWith("verification/lto/", okJson.GetProperty("objectKey").GetString());

        // JSON objectKey registration -> 200
        var jsonReq = AsUser(HttpMethod.Post, $"/api/v1/facilities/{_facilityId}/lto-proof?tenantSlug=manila-care", "clerk_clinic_owner");
        jsonReq.Content = JsonContent.Create(new { objectKey = "verification/lto/manual-key.pdf" });
        var jsonRes = await _client.SendAsync(jsonReq);
        Assert.Equal(HttpStatusCode.OK, jsonRes.StatusCode);
        var jsonResBody = await jsonRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("verification/lto/manual-key.pdf", jsonResBody.GetProperty("ltoEvidenceObjectKey").GetString());
    }

    [Fact]
    public async Task PublicConfirmAffiliationEndpoints_ValidateAndConfirmTokenAndOtp()
    {
        // Unknown token -> 404
        var notFoundRes = await _client.GetAsync("/api/v1/public/practitioners/confirm-affiliation?token=nonexistent");
        Assert.Equal(HttpStatusCode.NotFound, notFoundRes.StatusCode);

        // Valid GET preview -> 200
        var previewRes = await _client.GetAsync($"/api/v1/public/practitioners/confirm-affiliation?token={ConfirmToken}");
        Assert.Equal(HttpStatusCode.OK, previewRes.StatusCode);
        var previewJson = await previewRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("RN Clara Mendoza", previewJson.GetProperty("data").GetProperty("practitionerName").GetString());
        Assert.False(previewJson.GetProperty("data").GetProperty("alreadyConfirmed").GetBoolean());

        // Wrong OTP -> 400
        var badOtpRes = await _client.PostAsJsonAsync("/api/v1/public/practitioners/confirm-affiliation", new
        {
            token = ConfirmToken,
            otpCode = "000000"
        });
        Assert.Equal(HttpStatusCode.BadRequest, badOtpRes.StatusCode);

        // Valid token + OTP -> 200 Active affiliation
        var confirmRes = await _client.PostAsJsonAsync("/api/v1/public/practitioners/confirm-affiliation", new
        {
            token = ConfirmToken,
            otpCode = ConfirmOtp
        });
        Assert.Equal(HttpStatusCode.OK, confirmRes.StatusCode);
        var confirmJson = await confirmRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Active", confirmJson.GetProperty("data").GetProperty("affiliationStatus").GetString());
        Assert.False(confirmJson.GetProperty("data").GetProperty("alreadyConfirmed").GetBoolean());

        // Idempotent repeat call with token only (optional otpCode omitted) -> 200 alreadyConfirmed = true
        var repeatRes = await _client.PostAsJsonAsync("/api/v1/public/practitioners/confirm-affiliation", new
        {
            token = ConfirmToken
        });
        Assert.Equal(HttpStatusCode.OK, repeatRes.StatusCode);
        var repeatJson = await repeatRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(repeatJson.GetProperty("data").GetProperty("alreadyConfirmed").GetBoolean());
    }

    private sealed class HeaderTestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "TestHeaderAuth";
        public const string UserHeader = "X-Test-UserId";
        public const string EmailHeader = "X-Test-Email";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(UserHeader, out var userValues) || string.IsNullOrWhiteSpace(userValues.FirstOrDefault()))
                return Task.FromResult(AuthenticateResult.NoResult());

            var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, userValues.First()!) };
            if (Request.Headers.TryGetValue(EmailHeader, out var emailValues) && !string.IsNullOrWhiteSpace(emailValues.FirstOrDefault()))
                claims.Add(new(ClaimTypes.Email, emailValues.First()!));

            var identity = new ClaimsIdentity(claims, SchemeName);
            var principal = new ClaimsPrincipal(identity);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
        }
    }
}
