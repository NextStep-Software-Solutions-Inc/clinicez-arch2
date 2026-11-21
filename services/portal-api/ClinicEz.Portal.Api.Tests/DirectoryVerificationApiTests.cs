using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
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
using Amazon.S3;
using Amazon.S3.Model;
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
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Options;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Persistence.Interceptors;
using ClinicEz.Portal.Infrastructure.Persistence.Seeders;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
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
    private readonly StubInteropRequestClient _interopClient = new();
    private readonly ConcurrentDictionary<(string Bucket, string Key), (byte[] Bytes, string ContentType, string? FileName)> _r2Objects = new();
    private const string ConfirmToken = "confirm-token-secret-2026";
    private const string ConfirmOtp = "654321";

    private IAmazonS3 CreateMockS3Client()
    {
        var mock = new Mock<IAmazonS3>(MockBehavior.Strict);
        mock.Setup(c => c.PutObjectAsync(It.IsAny<PutObjectRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PutObjectRequest req, CancellationToken _) =>
            {
                Assert.True(req.DisablePayloadSigning);
                Assert.False(req.UseChunkEncoding);
                Assert.True(req.DisableDefaultChecksumValidation);
                using var ms = new MemoryStream();
                req.InputStream.Position = 0;
                req.InputStream.CopyTo(ms);
                var metaName = req.Metadata?["file-name"] ?? req.Metadata?["x-amz-meta-file-name"];
                _r2Objects[(req.BucketName, req.Key)] = (ms.ToArray(), req.ContentType, metaName);
                return new PutObjectResponse { HttpStatusCode = HttpStatusCode.OK };
            });

        mock.Setup(c => c.GetObjectAsync(It.IsAny<GetObjectRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((GetObjectRequest req, CancellationToken _) =>
            {
                if (!_r2Objects.TryGetValue((req.BucketName, req.Key), out var entry))
                {
                    throw new AmazonS3Exception("Not found")
                    {
                        StatusCode = HttpStatusCode.NotFound,
                        ErrorCode = "NoSuchKey"
                    };
                }

                var res = new GetObjectResponse
                {
                    BucketName = req.BucketName,
                    Key = req.Key,
                    HttpStatusCode = HttpStatusCode.OK,
                    ResponseStream = new MemoryStream(entry.Bytes, writable: false),
                };
                res.Headers.ContentType = entry.ContentType;
                if (!string.IsNullOrWhiteSpace(entry.FileName))
                    res.Metadata["file-name"] = entry.FileName;
                return res;
            });

        return mock.Object;
    }

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
        builder.Services.AddSingleton<LocalPortalEvidenceStorageService>();
        builder.Services.AddSingleton<IPortalEvidenceStorageService>(sp =>
            new R2PortalEvidenceStorageService(
                CreateMockS3Client(),
                R2Options.DefaultBucketName,
                sp.GetRequiredService<ILogger<R2PortalEvidenceStorageService>>(),
                sp.GetRequiredService<LocalPortalEvidenceStorageService>()));
        builder.Services.AddSingleton<IInteropRequestClient>(_interopClient);
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

        // Valid PDF magic bytes -> 200 with stored objectKey in R2 bucket clinicez-portal-uploads
        using var pdfForm = new MultipartFormDataContent();
        var pdfBytesRaw = "%PDF-1.4\n%test"u8.ToArray();
        var pdfBytes = new ByteArrayContent(pdfBytesRaw);
        pdfBytes.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
        pdfForm.Add(pdfBytes, "file", "doh-lto.pdf");
        var okReq = AsUser(HttpMethod.Post, $"/api/v1/facilities/{_facilityId}/lto-proof?tenantSlug=manila-care", "clerk_clinic_owner");
        okReq.Content = pdfForm;
        var okRes = await _client.SendAsync(okReq);
        Assert.Equal(HttpStatusCode.OK, okRes.StatusCode);
        var okJson = await okRes.Content.ReadFromJsonAsync<JsonElement>();
        var uploadedObjectKey = okJson.GetProperty("objectKey").GetString()!;
        Assert.StartsWith("verification/lto/", uploadedObjectKey);

        // Verify object was uploaded into Cloudflare R2 bucket clinicez-portal-uploads
        Assert.True(_r2Objects.TryGetValue((R2Options.DefaultBucketName, uploadedObjectKey), out var storedObj));
        Assert.Equal("application/pdf", storedObj.ContentType);
        Assert.Equal(pdfBytesRaw, storedObj.Bytes);

        // GET /facilities/{id}/lto-proof streams uploaded PDF inline to authorized tenant owner
        var getLtoRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/facilities/{_facilityId}/lto-proof?tenantSlug=manila-care", "clerk_clinic_owner"));
        Assert.Equal(HttpStatusCode.OK, getLtoRes.StatusCode);
        Assert.Equal("application/pdf", getLtoRes.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("inline", getLtoRes.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal(pdfBytesRaw, await getLtoRes.Content.ReadAsByteArrayAsync());

        // Unauthorized outsider cannot stream facility LTO proof -> 403
        var outsiderLtoRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/facilities/{_facilityId}/lto-proof?tenantSlug=manila-care", "clerk_outsider"));
        Assert.Equal(HttpStatusCode.Forbidden, outsiderLtoRes.StatusCode);

        // GET /admin/verification-queue/{requestId}/evidence enforces view:verifications and streams inline for authorized reviewers
        var forbiddenEvidenceRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{_facReqId}/evidence?kind=lto", "clerk_support", "support@clinicez.test"));
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenEvidenceRes.StatusCode);

        // Update facility verification request to point to the newly stored LTO file and stream via admin review endpoint
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var reqEntity = await db.FacilityVerificationRequests.FirstAsync(r => r.Id == _facReqId);
            reqEntity.LtoEvidenceObjectKey = okJson.GetProperty("objectKey").GetString();
            await db.SaveChangesAsync();
        }

        var adminEvidenceRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{_facReqId}/evidence?kind=lto", "clerk_verifier", "verifier@clinicez.test"));
        Assert.Equal(HttpStatusCode.OK, adminEvidenceRes.StatusCode);
        Assert.Equal("application/pdf", adminEvidenceRes.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("inline", adminEvidenceRes.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal(pdfBytesRaw, await adminEvidenceRes.Content.ReadAsByteArrayAsync());

        // JSON objectKey registration -> 200
        var jsonReq = AsUser(HttpMethod.Post, $"/api/v1/facilities/{_facilityId}/lto-proof?tenantSlug=manila-care", "clerk_clinic_owner");
        jsonReq.Content = JsonContent.Create(new { objectKey = "verification/lto/manual-key.pdf" });
        var jsonRes = await _client.SendAsync(jsonReq);
        Assert.Equal(HttpStatusCode.OK, jsonRes.StatusCode);
        var jsonResBody = await jsonRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("verification/lto/manual-key.pdf", jsonResBody.GetProperty("ltoEvidenceObjectKey").GetString());
    }

    [Fact]
    public async Task AdminVerificationEvidence_WriteThroughCachesClinicInteropProofInR2Bucket()
    {
        var prcPngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02 };
        _interopClient.ConfigureResponse("verification/prc/clara.pdf", new VerificationEvidenceRespondedPayload
        {
            Found = true,
            ContentType = "image/png",
            FileName = "clara-prc-card.png",
            Base64Content = Convert.ToBase64String(prcPngBytes)
        });

        // 1st request resolves via Interop Hub and write-through caches into clinicez-portal-uploads R2 bucket
        var firstRes = await _client.SendAsync(AsUser(
            HttpMethod.Get,
            $"/api/v1/admin/verification-queue/{_pracReqAwaitingOtpId}/evidence?kind=prc",
            "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, firstRes.StatusCode);
        Assert.Equal("image/png", firstRes.Content.Headers.ContentType?.MediaType);
        Assert.Equal(prcPngBytes, await firstRes.Content.ReadAsByteArrayAsync());
        Assert.Equal(1, _interopClient.RequestCount);
        Assert.True(_r2Objects.ContainsKey((R2Options.DefaultBucketName, "verification/prc/clara.pdf")));

        // Simulate clinic workstation going offline
        _interopClient.SimulateOffline = true;

        // 2nd request serves instantaneously from R2 cache without a second Interop round-trip
        var secondRes = await _client.SendAsync(AsUser(
            HttpMethod.Get,
            $"/api/v1/admin/verification-queue/{_pracReqAwaitingOtpId}/evidence?kind=prc",
            "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, secondRes.StatusCode);
        Assert.Equal("image/png", secondRes.Content.Headers.ContentType?.MediaType);
        Assert.Equal(prcPngBytes, await secondRes.Content.ReadAsByteArrayAsync());
        Assert.Equal(1, _interopClient.RequestCount);

        // Unicode / accented filename from Clinic Interop is sanitized to ASCII-safe Content-Disposition + R2 metadata
        var unicodeKey = "verification/prc/jose-pena.pdf";
        var pdfBytes = "%PDF-1.4\n%unicode-name"u8.ToArray();
        _interopClient.ConfigureResponse(unicodeKey, new VerificationEvidenceRespondedPayload
        {
            Found = true,
            ContentType = "application/pdf",
            FileName = "Dr. José Peña - PRC.pdf",
            Base64Content = Convert.ToBase64String(pdfBytes)
        });
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var reqEntity = await db.PractitionerVerificationRequests.FirstAsync(r => r.Id == _pracReqAwaitingOtpId);
            reqEntity.PrcEvidenceObjectKey = unicodeKey;
            await db.SaveChangesAsync();
        }
        _interopClient.SimulateOffline = false;
        var unicodeRes = await _client.SendAsync(AsUser(
            HttpMethod.Get,
            $"/api/v1/admin/verification-queue/{_pracReqAwaitingOtpId}/evidence?kind=prc",
            "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, unicodeRes.StatusCode);
        Assert.Equal("Dr. Jose Pena - PRC.pdf", unicodeRes.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
        Assert.Equal(pdfBytes, await unicodeRes.Content.ReadAsByteArrayAsync());
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

    [Fact]
    public async Task FacilitySettingsAndLtoProof_SyncActivePendingVerificationInPlace_AndLeaveApprovedSnapshotsUntouched()
    {
        // 1. Update facility settings with ltoExpiryDate while request is PendingReview
        var settingsReq = AsUser(HttpMethod.Put, $"/api/v1/facilities/{_facilityId}/settings", "clerk_clinic_owner");
        settingsReq.Content = JsonContent.Create(new
        {
            tenantSlug = "manila-care",
            licenseToOperate = "DOH-LTO-9988-REV1",
            ltoExpiryDate = "2029-03-31",
            contactNumber = "+639175551234",
            operatingHours = "Mon-Sun 07:00-21:00"
        });
        var settingsRes = await _client.SendAsync(settingsReq);
        Assert.Equal(HttpStatusCode.OK, settingsRes.StatusCode);

        // 2. Attach new LTO proof objectKey while PendingReview -> syncs onto active request
        var ltoReq = AsUser(HttpMethod.Post, $"/api/v1/facilities/{_facilityId}/lto-proof?tenantSlug=manila-care", "clerk_clinic_owner");
        ltoReq.Content = JsonContent.Create(new { objectKey = "verification/lto/ermita-lto-v2.pdf" });
        var ltoRes = await _client.SendAsync(ltoReq);
        Assert.Equal(HttpStatusCode.OK, ltoRes.StatusCode);

        // 3. GET /facilities returns ltoExpiryDate
        var facilitiesRes = await _client.SendAsync(AsUser(HttpMethod.Get, "/api/v1/facilities?tenantSlug=manila-care", "clerk_clinic_owner"));
        Assert.Equal(HttpStatusCode.OK, facilitiesRes.StatusCode);
        var facilitiesJson = await facilitiesRes.Content.ReadFromJsonAsync<JsonElement>();
        var firstFacility = facilitiesJson[0];
        Assert.Equal("2029-03-31", firstFacility.GetProperty("ltoExpiryDate").GetString());

        // 4. Admin detail reflects updated in-place snapshot & updatedAtUtc without creating duplicate rows
        var detailBeforeApproveRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{_facReqId}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, detailBeforeApproveRes.StatusCode);
        var detailBeforeApprove = await detailBeforeApproveRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("2029-03-31", detailBeforeApprove.GetProperty("dohLtoExpiryDate").GetString());
        Assert.Equal("+639175551234", detailBeforeApprove.GetProperty("clinicContactNumber").GetString());
        Assert.Equal("verification/lto/ermita-lto-v2.pdf", detailBeforeApprove.GetProperty("ltoEvidenceObjectKey").GetString());
        Assert.NotEqual(JsonValueKind.Null, detailBeforeApprove.GetProperty("updatedAtUtc").ValueKind);
        Assert.Equal(1, detailBeforeApprove.GetProperty("submissionHistory").GetArrayLength());

        // 5. Approve request -> stores ReviewedByDisplayName & ReviewedByEmail
        var approveReq = AsUser(HttpMethod.Post, $"/api/v1/admin/verification-queue/{_facReqId}/approve", "clerk_verifier");
        approveReq.Content = JsonContent.Create(new { notes = "Approved with LTO expiry" });
        var approveRes = await _client.SendAsync(approveReq);
        Assert.Equal(HttpStatusCode.OK, approveRes.StatusCode);

        var detailAfterApproveRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{_facReqId}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, detailAfterApproveRes.StatusCode);
        var detailAfterApprove = await detailAfterApproveRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Directory Verifier", detailAfterApprove.GetProperty("reviewedByDisplayName").GetString());
        Assert.Equal("verifier@clinicez.ph", detailAfterApprove.GetProperty("reviewedByEmail").GetString());
        Assert.Equal("Directory Verifier", detailAfterApprove.GetProperty("submissionHistory")[0].GetProperty("reviewedByDisplayName").GetString());

        // 6. Subsequent settings edit after approval must NOT mutate the approved request snapshot
        var postApproveSettingsReq = AsUser(HttpMethod.Put, $"/api/v1/facilities/{_facilityId}/settings", "clerk_clinic_owner");
        postApproveSettingsReq.Content = JsonContent.Create(new
        {
            tenantSlug = "manila-care",
            licenseToOperate = "DOH-LTO-MUTATE-ATTEMPT",
            ltoExpiryDate = "2031-12-31"
        });
        var postApproveSettingsRes = await _client.SendAsync(postApproveSettingsReq);
        Assert.Equal(HttpStatusCode.OK, postApproveSettingsRes.StatusCode);

        var detailImmutableRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{_facReqId}", "clerk_verifier"));
        var detailImmutable = await detailImmutableRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("DOH-LTO-9988-REV1", detailImmutable.GetProperty("dohLtoNumber").GetString());
        Assert.Equal("2029-03-31", detailImmutable.GetProperty("dohLtoExpiryDate").GetString());
    }

    [Fact]
    public async Task AdminVerificationDetail_ReturnsResubmissionDiffAndOtpReviewerDisplayName()
    {
        // Confirm OTP affiliation and verify admin detail reports Practitioner (OTP Confirmation)
        var confirmRes = await _client.PostAsJsonAsync("/api/v1/public/practitioners/confirm-affiliation", new
        {
            token = ConfirmToken,
            otpCode = ConfirmOtp
        });
        Assert.Equal(HttpStatusCode.OK, confirmRes.StatusCode);

        var pracDetailRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{_pracReqAwaitingOtpId}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, pracDetailRes.StatusCode);
        var pracDetail = await pracDetailRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Practitioner (OTP Confirmation)", pracDetail.GetProperty("reviewedByDisplayName").GetString());
        Assert.Equal("owner@manilacare.ph", pracDetail.GetProperty("submittedByDisplayName").GetString());

        // Seed Rejected #1 -> PendingReview #2 for a second facility and verify resubmissionDiff over HTTP
        var fac2Id = Guid.NewGuid();
        var sub1Id = Guid.NewGuid();
        var sub2Id = Guid.NewGuid();
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var fac2 = new Facility
            {
                Id = fac2Id,
                TenantId = _tenantId,
                Name = "Manila Care Makati",
                Slug = "manila-care-makati",
                FacilityType = FacilityType.Clinic,
                Status = FacilityStatus.Active,
                PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
            };
            var p1 = new FacilityVerificationRequestedPayload
            {
                RequestId = sub1Id,
                TenantId = _tenantId.ToString(),
                FacilityId = fac2Id,
                FacilityName = fac2.Name,
                DohLtoNumber = "LTO-MKT-1",
                LtoEvidenceObjectKey = "verification/lto/mkt-v1.pdf",
                RequestKind = "Initial",
                SubmittedAtUtc = DateTime.UtcNow.AddDays(-2)
            };
            var p2 = p1 with
            {
                RequestId = sub2Id,
                DohLtoNumber = "LTO-MKT-2",
                DohLtoExpiryDate = new DateOnly(2029, 1, 15),
                LtoEvidenceObjectKey = "verification/lto/mkt-v2.pdf",
                SupportsTeleconsult = true,
                RequestKind = "Resubmission",
                SubmittedAtUtc = DateTime.UtcNow
            };
            db.Facilities.Add(fac2);
            db.FacilityVerificationRequests.AddRange(
                new FacilityVerificationRequest
                {
                    Id = sub1Id,
                    TenantId = _tenantId,
                    FacilityId = fac2Id,
                    SubmissionNumber = 1,
                    CorrelationId = sub1Id.ToString(),
                    RequestKind = "Initial",
                    SubmittedAtUtc = p1.SubmittedAtUtc,
                    SubmittedSnapshotJson = JsonSerializer.Serialize(p1, InteropJson.Options),
                    LtoEvidenceObjectKey = p1.LtoEvidenceObjectKey,
                    Status = "Rejected",
                    ReviewedByAdminUserId = "clerk_verifier",
                    ReviewerNotes = "Update LTO number and expiry"
                },
                new FacilityVerificationRequest
                {
                    Id = sub2Id,
                    TenantId = _tenantId,
                    FacilityId = fac2Id,
                    SubmissionNumber = 2,
                    CorrelationId = sub2Id.ToString(),
                    RequestKind = "Resubmission",
                    SubmittedAtUtc = p2.SubmittedAtUtc,
                    SubmittedSnapshotJson = JsonSerializer.Serialize(p2, InteropJson.Options),
                    LtoEvidenceObjectKey = p2.LtoEvidenceObjectKey,
                    Status = "PendingReview"
                });
            await db.SaveChangesAsync();
        }

        var resubRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{sub2Id}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, resubRes.StatusCode);
        var resubJson = await resubRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(resubJson.GetProperty("supportsTeleconsult").GetBoolean());
        var diff = resubJson.GetProperty("resubmissionDiff");
        Assert.Equal(1, diff.GetProperty("previousSubmissionNumber").GetInt32());
        Assert.Equal("Rejected", diff.GetProperty("previousStatus").GetString());
        Assert.Equal("Update LTO number and expiry", diff.GetProperty("previousReason").GetString());
        Assert.True(diff.GetProperty("ltoProofUpdated").GetBoolean());
        Assert.True(diff.GetProperty("changedFields").GetArrayLength() >= 2);
    }

    [Fact]
    public async Task FacilitySettings_ExplicitNullLtoExpiryDate_ClearsPendingAndFacility_WhileOmittedPreserves()
    {
        // 1. Set ltoExpiryDate while request is PendingReview
        var setReq = AsUser(HttpMethod.Put, $"/api/v1/facilities/{_facilityId}/settings", "clerk_clinic_owner");
        setReq.Content = JsonContent.Create(new
        {
            tenantSlug = "manila-care",
            ltoExpiryDate = "2029-03-31"
        });
        var setRes = await _client.SendAsync(setReq);
        Assert.Equal(HttpStatusCode.OK, setRes.StatusCode);

        // 2. Partial PUT omitting ltoExpiryDate must preserve 2029-03-31 on both facility and pending request
        var partialReq = AsUser(HttpMethod.Put, $"/api/v1/facilities/{_facilityId}/settings", "clerk_clinic_owner");
        partialReq.Content = JsonContent.Create(new
        {
            tenantSlug = "manila-care",
            operatingHours = "Mon-Sun 08:00-20:00"
        });
        var partialRes = await _client.SendAsync(partialReq);
        Assert.Equal(HttpStatusCode.OK, partialRes.StatusCode);

        var facAfterPartialRes = await _client.SendAsync(AsUser(HttpMethod.Get, "/api/v1/facilities?tenantSlug=manila-care", "clerk_clinic_owner"));
        Assert.Equal(HttpStatusCode.OK, facAfterPartialRes.StatusCode);
        var facAfterPartial = (await facAfterPartialRes.Content.ReadFromJsonAsync<JsonElement>())[0];
        Assert.Equal("2029-03-31", facAfterPartial.GetProperty("ltoExpiryDate").GetString());

        var detailAfterPartialRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{_facReqId}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, detailAfterPartialRes.StatusCode);
        var detailAfterPartial = await detailAfterPartialRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("2029-03-31", detailAfterPartial.GetProperty("dohLtoExpiryDate").GetString());

        // 3. Explicit ltoExpiryDate: null clears Facility.LtoExpiryDate and pending queue/detail DohLtoExpiryDate
        var clearReq = AsUser(HttpMethod.Put, $"/api/v1/facilities/{_facilityId}/settings", "clerk_clinic_owner");
        clearReq.Content = JsonContent.Create(new
        {
            tenantSlug = "manila-care",
            ltoExpiryDate = (string?)null
        });
        var clearRes = await _client.SendAsync(clearReq);
        Assert.Equal(HttpStatusCode.OK, clearRes.StatusCode);

        var facAfterClearRes = await _client.SendAsync(AsUser(HttpMethod.Get, "/api/v1/facilities?tenantSlug=manila-care", "clerk_clinic_owner"));
        Assert.Equal(HttpStatusCode.OK, facAfterClearRes.StatusCode);
        var facAfterClear = (await facAfterClearRes.Content.ReadFromJsonAsync<JsonElement>())[0];
        Assert.Equal(JsonValueKind.Null, facAfterClear.GetProperty("ltoExpiryDate").ValueKind);

        var queueAfterClearRes = await _client.SendAsync(AsUser(HttpMethod.Get, "/api/v1/admin/verification-queue", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, queueAfterClearRes.StatusCode);
        var queueAfterClear = await queueAfterClearRes.Content.ReadFromJsonAsync<JsonElement>();
        var queueItem = queueAfterClear.GetProperty("items").EnumerateArray().Single(i => i.GetProperty("id").GetGuid() == _facReqId);
        Assert.Equal(JsonValueKind.Null, queueItem.GetProperty("dohLtoExpiryDate").ValueKind);

        var detailAfterClearRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{_facReqId}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, detailAfterClearRes.StatusCode);
        var detailAfterClear = await detailAfterClearRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, detailAfterClear.GetProperty("dohLtoExpiryDate").ValueKind);
    }

    [Fact]
    public async Task Resubmission_WithClearedDohLtoExpiryDate_PreservesNullAcrossLtoProofUploadAndPartialSettingsPut()
    {
        var facId = Guid.NewGuid();
        var sub1Id = Guid.NewGuid();
        var sub2Id = Guid.NewGuid();
        var priorExpiry = new DateOnly(2029, 6, 30);

        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var fac = new Facility
            {
                Id = facId,
                TenantId = _tenantId,
                Name = "Manila Care Quezon City",
                Slug = "manila-care-qc",
                FacilityType = FacilityType.Clinic,
                Status = FacilityStatus.Active,
                LtoExpiryDate = priorExpiry,
                LtoEvidenceObjectKey = "verification/lto/qc-v1.pdf",
                PlatformVerificationStatus = PlatformVerificationStatus.Rejected
            };
            var sub1Payload = new FacilityVerificationRequestedPayload
            {
                RequestId = sub1Id,
                TenantId = _tenantId.ToString(),
                FacilityId = facId,
                FacilityName = fac.Name,
                FacilitySlug = fac.Slug,
                DohLtoNumber = "DOH-LTO-QC-1",
                DohLtoExpiryDate = priorExpiry,
                LtoEvidenceObjectKey = "verification/lto/qc-v1.pdf",
                RequestKind = "Initial",
                SubmittedByClinicUserId = "clerk_clinic_owner",
                SubmittedByDisplayName = "Clinic Owner",
                SubmittedAtUtc = DateTime.UtcNow.AddDays(-1)
            };
            db.Facilities.Add(fac);
            db.FacilityVerificationRequests.Add(new FacilityVerificationRequest
            {
                Id = sub1Id,
                TenantId = _tenantId,
                FacilityId = facId,
                SubmissionNumber = 1,
                CorrelationId = sub1Id.ToString(),
                RequestKind = "Initial",
                SubmittedByClinicUserId = "clerk_clinic_owner",
                SubmittedByDisplayName = "Clinic Owner",
                SubmittedAtUtc = sub1Payload.SubmittedAtUtc,
                SubmittedSnapshotJson = DirectoryVerificationHelper.SerializeFacilitySnapshot(sub1Payload),
                LtoEvidenceObjectKey = sub1Payload.LtoEvidenceObjectKey,
                Status = "Rejected",
                ReviewedByAdminUserId = "clerk_verifier",
                ReviewerNotes = "Remove invalid expiry date"
            });
            await db.SaveChangesAsync();

            var reqHandler = new FacilityVerificationRequestedHandler(
                db, TimeProvider.System, NullLogger<FacilityVerificationRequestedHandler>.Instance);
            var sub2Payload = sub1Payload with
            {
                RequestId = sub2Id,
                DohLtoExpiryDate = null,
                RequestKind = "Resubmission",
                SubmittedAtUtc = DateTime.UtcNow
            };
            await reqHandler.HandleAsync(
                sub2Payload,
                new InteropMessageContext(InteropEnvelope.Create(
                    InteropTypes.FacilityVerificationRequested,
                    Party.ForFacility(_tenantId.ToString(), facId.ToString(), FacilityType.Clinic),
                    Party.Portal,
                    sub2Id,
                    sub2Payload)),
                CancellationToken.None);
            await db.SaveChangesAsync();
        }

        // Baseline: Resubmission has explicit dohLtoExpiryDate: null while Facility still holds prior 2029-06-30
        var beforeRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{sub2Id}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, beforeRes.StatusCode);
        var beforeJson = await beforeRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, beforeJson.GetProperty("dohLtoExpiryDate").ValueKind);

        // 1. Upload new LTO proof via POST /api/v1/facilities/{id}/lto-proof -> must NOT resurrect 2029-06-30
        var ltoReq = AsUser(HttpMethod.Post, $"/api/v1/facilities/{facId}/lto-proof?tenantSlug=manila-care", "clerk_clinic_owner");
        ltoReq.Content = JsonContent.Create(new { objectKey = "verification/lto/qc-v2.pdf" });
        var ltoRes = await _client.SendAsync(ltoReq);
        Assert.Equal(HttpStatusCode.OK, ltoRes.StatusCode);

        var afterLtoRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{sub2Id}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, afterLtoRes.StatusCode);
        var afterLtoJson = await afterLtoRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, afterLtoJson.GetProperty("dohLtoExpiryDate").ValueKind);
        Assert.Equal("verification/lto/qc-v2.pdf", afterLtoJson.GetProperty("ltoEvidenceObjectKey").GetString());

        // 2. Partial PUT /api/v1/facilities/{id}/settings omitting ltoExpiryDate -> must NOT resurrect 2029-06-30
        var partialReq = AsUser(HttpMethod.Put, $"/api/v1/facilities/{facId}/settings", "clerk_clinic_owner");
        partialReq.Content = JsonContent.Create(new
        {
            tenantSlug = "manila-care",
            operatingHours = "Mon-Sat 09:00-18:00"
        });
        var partialRes = await _client.SendAsync(partialReq);
        Assert.Equal(HttpStatusCode.OK, partialRes.StatusCode);

        var afterPartialRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{sub2Id}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, afterPartialRes.StatusCode);
        var afterPartialJson = await afterPartialRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, afterPartialJson.GetProperty("dohLtoExpiryDate").ValueKind);
        Assert.Equal("Mon-Sat 09:00-18:00", afterPartialJson.GetProperty("snapshot").GetProperty("operatingHours").GetString());
        var changedFields = afterPartialJson.GetProperty("resubmissionDiff").GetProperty("changedFields").EnumerateArray().ToList();
        var ltoDiff = Assert.Single(changedFields, c => c.GetProperty("fieldKey").GetString() == "dohLtoExpiryDate");
        Assert.Equal("Removed", ltoDiff.GetProperty("changeKind").GetString());

        // 3. Explicit PUT /api/v1/facilities/{id}/settings WITH ltoExpiryDate updates pending snapshot as expected
        var setReq = AsUser(HttpMethod.Put, $"/api/v1/facilities/{facId}/settings", "clerk_clinic_owner");
        setReq.Content = JsonContent.Create(new
        {
            tenantSlug = "manila-care",
            ltoExpiryDate = "2030-01-15"
        });
        var setRes = await _client.SendAsync(setReq);
        Assert.Equal(HttpStatusCode.OK, setRes.StatusCode);

        var afterSetRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{sub2Id}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, afterSetRes.StatusCode);
        var afterSetJson = await afterSetRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("2030-01-15", afterSetJson.GetProperty("dohLtoExpiryDate").GetString());
    }

    [Fact]
    public async Task Issue227_SuspendAndReinstatePractitionerEndpoints_EnforceReasonRbacAndSyncQueueLifecycle()
    {
        // Approve initial facility + Dr. Jose Rizal so canonical Practitioner record exists
        var approveReq = AsUser(HttpMethod.Post, $"/api/v1/admin/verification-queue/{_facReqId}/approve", "clerk_verifier");
        approveReq.Content = JsonContent.Create(new { notes = "Verified LTO & PRC" });
        var approveRes = await _client.SendAsync(approveReq);
        Assert.Equal(HttpStatusCode.OK, approveRes.StatusCode);
        var approveJson = await approveRes.Content.ReadFromJsonAsync<JsonElement>();
        var pracId = approveJson.GetProperty("approvedPractitionerIds")[0].GetGuid();

        // Seed an open PendingReview practitioner resubmission for the same verified practitioner
        var openResubId = Guid.NewGuid();
        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.PractitionerVerificationRequests.Add(new PractitionerVerificationRequest
            {
                Id = openResubId,
                TenantId = _tenantId,
                FacilityId = _facilityId,
                ClinicStaffMemberId = Guid.NewGuid(),
                PractitionerId = pracId,
                SubmissionNumber = 6,
                CorrelationId = openResubId.ToString(),
                RequestKind = "Resubmission",
                ProfessionKind = "Doctor",
                SubmittedPrcLicenseNo = "0088112",
                NormalizedPrcLicenseNo = "0088112",
                SubmittedSnapshotJson = "{}",
                Status = "PendingReview",
                SubmittedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        // 1. Suspend without compliance reason -> 400 BadRequest
        var blankSuspendReq = AsUser(HttpMethod.Post, $"/api/v1/admin/practitioners/{pracId}/suspend", "clerk_super_admin");
        blankSuspendReq.Content = JsonContent.Create(new { reason = "   " });
        var blankSuspendRes = await _client.SendAsync(blankSuspendReq);
        Assert.Equal(HttpStatusCode.BadRequest, blankSuspendRes.StatusCode);

        // 2. Suspend with compliance reason -> 200 OK & closes open PendingReview request
        var validSuspendReq = AsUser(HttpMethod.Post, $"/api/v1/admin/practitioners/{pracId}/suspend", "clerk_super_admin");
        validSuspendReq.Content = JsonContent.Create(new { reason = "Compliance audit hold" });
        var validSuspendRes = await _client.SendAsync(validSuspendReq);
        Assert.Equal(HttpStatusCode.OK, validSuspendRes.StatusCode);
        var suspendJson = await validSuspendRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, suspendJson.GetProperty("closedPendingRequestsCount").GetInt32());

        var detailAfterSuspendRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{openResubId}", "clerk_verifier"));
        Assert.Equal(HttpStatusCode.OK, detailAfterSuspendRes.StatusCode);
        var detailAfterSuspend = await detailAfterSuspendRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Rejected", detailAfterSuspend.GetProperty("status").GetString());
        Assert.Equal(pracId, detailAfterSuspend.GetProperty("canonicalPractitionerId").GetGuid());
        Assert.Equal("Suspended", detailAfterSuspend.GetProperty("canonicalPractitionerStatus").GetString());

        // 3. Reinstate RBAC & validation: verifier -> 403; blank reason -> 400; super_admin -> 200; duplicate -> 409
        var verifierReinstateReq = AsUser(HttpMethod.Post, $"/api/v1/admin/practitioners/{pracId}/reinstate", "clerk_verifier");
        verifierReinstateReq.Content = JsonContent.Create(new { reason = "Cleared" });
        var verifierReinstateRes = await _client.SendAsync(verifierReinstateReq);
        Assert.Equal(HttpStatusCode.Forbidden, verifierReinstateRes.StatusCode);

        var blankReinstateReq = AsUser(HttpMethod.Post, $"/api/v1/admin/practitioners/{pracId}/reinstate", "clerk_super_admin");
        blankReinstateReq.Content = JsonContent.Create(new { reason = "" });
        var blankReinstateRes = await _client.SendAsync(blankReinstateReq);
        Assert.Equal(HttpStatusCode.BadRequest, blankReinstateRes.StatusCode);

        var okReinstateReq = AsUser(HttpMethod.Post, $"/api/v1/admin/practitioners/{pracId}/reinstate", "clerk_super_admin");
        okReinstateReq.Content = JsonContent.Create(new { reason = "Compliance hold lifted" });
        var okReinstateRes = await _client.SendAsync(okReinstateReq);
        Assert.Equal(HttpStatusCode.OK, okReinstateRes.StatusCode);

        var detailAfterReinstateRes = await _client.SendAsync(AsUser(HttpMethod.Get, $"/api/v1/admin/verification-queue/{openResubId}", "clerk_verifier"));
        var detailAfterReinstate = await detailAfterReinstateRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Verified", detailAfterReinstate.GetProperty("canonicalPractitionerStatus").GetString());

        var dupReinstateReq = AsUser(HttpMethod.Post, $"/api/v1/admin/practitioners/{pracId}/reinstate", "clerk_super_admin");
        dupReinstateReq.Content = JsonContent.Create(new { reason = "Duplicate" });
        var dupReinstateRes = await _client.SendAsync(dupReinstateReq);
        Assert.Equal(HttpStatusCode.Conflict, dupReinstateRes.StatusCode);
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

    private sealed class StubInteropRequestClient : IInteropRequestClient
    {
        private readonly Dictionary<string, VerificationEvidenceRespondedPayload> _responses = new(StringComparer.Ordinal);
        public int RequestCount { get; private set; }
        public bool SimulateOffline { get; set; }

        public void ConfigureResponse(string objectKey, VerificationEvidenceRespondedPayload payload)
        {
            _responses[objectKey] = payload;
        }

        public Task<TReply> RequestAsync<TRequest, TReply>(
            string requestType,
            string replyType,
            Party from,
            Party to,
            TRequest payload,
            TimeSpan? timeout = null,
            CancellationToken ct = default)
        {
            RequestCount++;
            if (SimulateOffline)
            {
                throw new InteropRequestTimeoutException(requestType, Guid.NewGuid(), timeout ?? TimeSpan.FromSeconds(25));
            }

            if (payload is VerificationEvidenceRequestedPayload req &&
                _responses.TryGetValue(req.ObjectKey, out var reply) &&
                reply is TReply typedReply)
            {
                return Task.FromResult(typedReply);
            }

            if (typeof(TReply) == typeof(VerificationEvidenceRespondedPayload))
            {
                return Task.FromResult((TReply)(object)new VerificationEvidenceRespondedPayload
                {
                    Found = false,
                    Error = "Not found in stub clinic storage."
                });
            }

            throw new InvalidOperationException($"Unsupported stub request type {typeof(TRequest).Name}");
        }
    }
}
