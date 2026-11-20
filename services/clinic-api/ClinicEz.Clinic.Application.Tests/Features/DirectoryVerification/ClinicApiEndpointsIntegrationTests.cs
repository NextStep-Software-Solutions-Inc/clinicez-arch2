using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Workspace;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.DirectoryVerification;

public sealed class ClinicApiEndpointsIntegrationTests : IAsyncLifetime
{
    private WebApplication _app = null!;
    private HttpClient _client = null!;
    private string _dbName = null!;
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string TenantId = "tenant-clinic-api-tests";
    private readonly Guid _adminStaffId = Guid.NewGuid();
    private readonly FixedClock _clock = new(new DateTime(2026, 11, 19, 6, 0, 0, DateTimeKind.Utc)); // 14:00 Asia/Manila
    private readonly StubInteropRequestClient _interopClient = new();

    private sealed class FixedClock(DateTime utcNow) : TimeProvider
    {
        private readonly DateTimeOffset _utcNow = new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
        public override DateTimeOffset GetUtcNow() => _utcNow;
    }

    private sealed class TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "ClinicTestAuth";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var staffId = Request.Headers["X-Test-StaffId"].FirstOrDefault() ?? Guid.NewGuid().ToString();
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, staffId),
                new("sub", staffId)
            };
            var identity = new ClaimsIdentity(claims, SchemeName);
            var principal = new ClaimsPrincipal(identity);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
        }
    }

    private sealed class HeaderClinicContext(
        IHttpContextAccessor accessor,
        string tenantId,
        Guid clinicId,
        Guid defaultStaffId) : IClinicContext
    {
        public string TenantId => tenantId;
        public Guid ClinicId => clinicId;
        public Guid? BranchId => null;

        public Guid? StaffId
        {
            get
            {
                var header = accessor.HttpContext?.Request.Headers["X-Test-StaffId"].FirstOrDefault();
                return Guid.TryParse(header, out var id) ? id : defaultStaffId;
            }
        }

        public string? StaffName => accessor.HttpContext?.Request.Headers["X-Test-StaffName"].FirstOrDefault() ?? "Dr. Test Admin";
        public string? StaffRole => "Admin";

        public IReadOnlyList<string> Permissions
        {
            get
            {
                var header = accessor.HttpContext?.Request.Headers["X-Test-Permissions"].FirstOrDefault();
                if (header is null)
                {
                    return [ClinicPermissions.SettingsManage, ClinicPermissions.StaffManage, ClinicPermissions.AppointmentsManage];
                }

                if (string.IsNullOrWhiteSpace(header) || string.Equals(header, "none", StringComparison.OrdinalIgnoreCase))
                {
                    return [];
                }

                return header.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            }
        }

        public bool HasPermission(string permission) =>
            Permissions.Contains("*", StringComparer.OrdinalIgnoreCase)
            || Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
    }

    private sealed class StubInteropRequestClient : IInteropRequestClient
    {
        public Func<string, object, object>? Handler { get; set; }
        public Exception? Failure { get; set; }

        public Task<TResponse> RequestAsync<TRequest, TResponse>(
            string requestType,
            string expectedReplyType,
            Party from,
            Party to,
            TRequest payload,
            TimeSpan? timeout = null,
            CancellationToken ct = default)
        {
            if (Failure is not null)
                throw Failure;

            if (Handler is null)
                return Task.FromResult((TResponse)(object)new VerificationUpdateRespondedPayload
                {
                    Succeeded = true,
                    CurrentStatus = "PendingReview",
                    UpdatedAtUtc = DateTime.UtcNow
                });

            return Task.FromResult((TResponse)Handler(requestType, payload!));
        }
    }

    public async Task InitializeAsync()
    {
        _dbName = $"clinic-api-tests-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();

        builder.Services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
            })
            .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, null);

        builder.Services.AddHttpContextAccessor();
        builder.Services.AddApiServices();
        builder.Services.AddControllers()
            .AddApplicationPart(typeof(ClinicSettingsController).Assembly);
        builder.Services.AddApplicationServices();
        builder.Services.Replace(ServiceDescriptor.Singleton<TimeProvider>(_clock));

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection([new KeyValuePair<string, string?>("DbSchema", "public")])
            .Build();
        builder.Services.AddSingleton<IConfiguration>(config);
        builder.Services.AddScoped<IClinicContext>(sp =>
            new HeaderClinicContext(sp.GetRequiredService<IHttpContextAccessor>(), TenantId, _clinicId, _adminStaffId));
        builder.Services.AddDbContext<ApplicationDbContext>(options =>
            options.UseInMemoryDatabase(_dbName));
        builder.Services.AddScoped<ISieveProcessor, SieveProcessor>();
        builder.Services.AddScoped(_ => Substitute.For<IProductRepository>());
        builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
        builder.Services.AddScoped(typeof(IRepository<>), typeof(Repository<>));

        builder.Services.AddSingleton<IInteropRequestClient>(_interopClient);
        builder.Services.AddSingleton(Substitute.For<IInteropPublisher>());
        builder.Services.AddSingleton(Substitute.For<IAuditLogQueue>());
        builder.Services.AddSingleton(Substitute.For<IPhilHealthProxyClient>());
        builder.Services.AddSingleton(Substitute.For<IPharmacyGamotGateway>());
        builder.Services.AddSingleton(Substitute.For<IPatientRecordGateway>());
        builder.Services.AddSingleton(Substitute.For<ILabResultIntake>());
        var storage = Substitute.For<IClinicStorageService>();
        storage.SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<string>(0));
        builder.Services.AddSingleton(storage);
        var encryption = Substitute.For<IClinicEncryptionService>();
        encryption.EncryptAsync(Arg.Any<byte[]>(), Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var bytes = ci.ArgAt<byte[]>(0);
                return new ClinicEncryptedPayload(bytes, "iv", "tag", "hash", bytes.Length, "{\"k\":\"wrapped\"}");
            });
        builder.Services.AddSingleton(encryption);
        builder.Services.AddSingleton(Substitute.For<IClinicDocumentPdfService>());
        builder.Services.AddSingleton(Substitute.For<IClinicCensusExcelService>());
        builder.Services.AddSingleton(Substitute.For<ISampleDocumentGenerator>());
        builder.Services.AddSingleton(Substitute.For<IWorkspaceProfileProvider>());
        builder.Services.AddSingleton(Substitute.For<IKioskAccessInvalidator>());
        builder.Services.AddSingleton(Substitute.For<IStaffAccessInvalidator>());
        builder.Services.AddSingleton(Substitute.For<IFacilityLicenseValidator>());
        builder.Services.AddSingleton(Substitute.For<IBillingRequestPublisher>());

        _app = builder.Build();
        _app.UseExceptionHandler();
        _app.UseRouting();
        _app.UseAuthentication();
        _app.UseAuthorization();
        _app.MapControllers();
        await _app.StartAsync();
        _client = _app.GetTestClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _app.DisposeAsync();
    }

    private async Task DbAsync(Func<ApplicationDbContext, Task> action)
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await action(db);
        await db.SaveChangesAsync();
    }

    private HttpRequestMessage CreateRequest(
        HttpMethod method,
        string url,
        object? body = null,
        Guid? staffId = null,
        string? permissions = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("X-Test-StaffId", (staffId ?? _adminStaffId).ToString());
        if (permissions is not null)
        {
            req.Headers.Add("X-Test-Permissions", permissions);
        }

        if (body is not null)
        {
            req.Content = JsonContent.Create(body);
        }

        return req;
    }

    [Fact]
    public async Task FacilityPendingUpdateEndpoint_Returns200_409Conflict_And503OnTimeout()
    {
        await DbAsync(async db =>
        {
            db.Settings.Add(new FacilitySettings
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                ClinicName = "API Pipeline Clinic",
                PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
            });
            await Task.CompletedTask;
        });

        // 1. 200 OK when PendingReview and Portal succeeds
        _interopClient.Failure = null;
        _interopClient.Handler = (_, _) => new VerificationUpdateRespondedPayload
        {
            Succeeded = true,
            CurrentStatus = "PendingReview",
            UpdatedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        var okResp = await _client.SendAsync(CreateRequest(HttpMethod.Put, "/api/v1/clinic-settings/directory-publishing/pending"));
        okResp.StatusCode.Should().Be(HttpStatusCode.OK);

        // 2. 503 ServiceUnavailable on InteropRequestTimeoutException
        _interopClient.Failure = new InteropRequestTimeoutException(InteropTypes.FacilityVerificationUpdateRequested, Guid.NewGuid(), TimeSpan.FromSeconds(15));
        var timeoutResp = await _client.SendAsync(CreateRequest(HttpMethod.Put, "/api/v1/clinic-settings/directory-publishing/pending"));
        timeoutResp.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        using (var timeoutJson = JsonDocument.Parse(await timeoutResp.Content.ReadAsStringAsync()))
        {
            timeoutJson.RootElement.GetProperty("errorCode").GetString().Should().Be("SERVICE_UNAVAILABLE");
        }
        _interopClient.Failure = null;

        // 3. 409 Conflict when Portal responds with verification_request_not_pending
        var conflictReqId = Guid.NewGuid();
        _interopClient.Handler = (_, _) => new VerificationUpdateRespondedPayload
        {
            Succeeded = false,
            Conflict = true,
            ErrorCode = "verification_request_not_pending",
            CurrentStatus = "Approved",
            RequestId = conflictReqId,
            Message = "Already approved on Portal."
        };
        var portalConflictResp = await _client.SendAsync(CreateRequest(HttpMethod.Put, "/api/v1/clinic-settings/directory-publishing/pending"));
        portalConflictResp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        using (var conflictJson = JsonDocument.Parse(await portalConflictResp.Content.ReadAsStringAsync()))
        {
            conflictJson.RootElement.GetProperty("errorCode").GetString().Should().Be("verification_request_not_pending");
            conflictJson.RootElement.GetProperty("data").GetProperty("currentStatus").GetString().Should().Be("Approved");
            conflictJson.RootElement.GetProperty("data").GetProperty("requestId").GetGuid().Should().Be(conflictReqId);
        }

        // 4. 409 Conflict when local status is Verified / Rejected / Unverified
        foreach (var status in new[] { PlatformVerificationStatus.Verified, PlatformVerificationStatus.Rejected, PlatformVerificationStatus.Unverified })
        {
            await DbAsync(async db =>
            {
                var s = await db.Settings.FirstAsync();
                s.PlatformVerificationStatus = status;
            });

            var localConflictResp = await _client.SendAsync(CreateRequest(HttpMethod.Put, "/api/v1/clinic-settings/directory-publishing/pending"));
            localConflictResp.StatusCode.Should().Be(HttpStatusCode.Conflict);
            using var json = JsonDocument.Parse(await localConflictResp.Content.ReadAsStringAsync());
            json.RootElement.GetProperty("errorCode").GetString().Should().Be("verification_request_not_pending");
            json.RootElement.GetProperty("data").GetProperty("currentStatus").GetString().Should().Be(status.ToString());
        }
    }

    [Fact]
    public async Task StaffPendingAndSubmitVerificationEndpoints_EnforceSelfVsAdminAuth_409_And503()
    {
        var doctorId = Guid.NewGuid();
        var otherStaffId = Guid.NewGuid();
        await DbAsync(async db =>
        {
            db.Settings.Add(new FacilitySettings
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                ClinicName = "Staff API Clinic"
            });
            db.StaffMembers.Add(new StaffMember
            {
                Id = doctorId,
                TenantId = TenantId,
                ClinicId = _clinicId,
                FirstName = "Clara",
                LastName = "Reyes",
                Role = StaffRole.Doctor,
                PrcLicenseNumber = "0123456",
                PrcExpiryDate = new DateOnly(2028, 12, 31),
                PrcEvidenceObjectKey = "verification/prc/clara.pdf",
                VerificationContact = "clara@clinic.ph",
                IsDirectoryOptIn = true,
                PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
                IsActive = true
            });
            await Task.CompletedTask;
        });

        _interopClient.Failure = null;
        _interopClient.Handler = (_, _) => new VerificationUpdateRespondedPayload
        {
            Succeeded = true,
            CurrentStatus = "PendingReview",
            UpdatedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        // 1. 403 Forbidden when caller lacks StaffManage and is not self
        var forbiddenResp = await _client.SendAsync(CreateRequest(
            HttpMethod.Put,
            $"/api/v1/staff/{doctorId}/verification/pending",
            staffId: otherStaffId,
            permissions: "none"));
        forbiddenResp.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        // 2. 200 OK when caller is self without StaffManage
        var selfOkResp = await _client.SendAsync(CreateRequest(
            HttpMethod.Put,
            $"/api/v1/staff/{doctorId}/verification/pending",
            staffId: doctorId,
            permissions: "none"));
        selfOkResp.StatusCode.Should().Be(HttpStatusCode.OK);

        // 3. 409 on POST /submit-verification when already PendingVerification
        var doubleSubmitResp = await _client.SendAsync(CreateRequest(
            HttpMethod.Post,
            $"/api/v1/staff/{doctorId}/submit-verification"));
        doubleSubmitResp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        using (var doubleSubmitJson = JsonDocument.Parse(await doubleSubmitResp.Content.ReadAsStringAsync()))
        {
            doubleSubmitJson.RootElement.GetProperty("errorCode").GetString().Should().Be("verification_request_not_pending");
        }

        // 4. 503 on InteropRequestTimeoutException for PUT /staff/{id}/verification/pending
        _interopClient.Failure = new InteropRequestTimeoutException(InteropTypes.PractitionerVerificationUpdateRequested, Guid.NewGuid(), TimeSpan.FromSeconds(15));
        var timeoutResp = await _client.SendAsync(CreateRequest(
            HttpMethod.Put,
            $"/api/v1/staff/{doctorId}/verification/pending",
            staffId: doctorId,
            permissions: "none"));
        timeoutResp.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        using (var timeoutJson = JsonDocument.Parse(await timeoutResp.Content.ReadAsStringAsync()))
        {
            timeoutJson.RootElement.GetProperty("errorCode").GetString().Should().Be("SERVICE_UNAVAILABLE");
        }
        _interopClient.Failure = null;

        // 5. 409 when practitioner status is Verified (non-pending)
        await DbAsync(async db =>
        {
            var staff = await db.StaffMembers.FirstAsync(s => s.Id == doctorId);
            staff.PublicVerificationStatus = PractitionerVerificationLevel.Verified;
        });
        var nonPendingResp = await _client.SendAsync(CreateRequest(
            HttpMethod.Put,
            $"/api/v1/staff/{doctorId}/verification/pending"));
        nonPendingResp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        using (var nonPendingJson = JsonDocument.Parse(await nonPendingResp.Content.ReadAsStringAsync()))
        {
            nonPendingJson.RootElement.GetProperty("errorCode").GetString().Should().Be("verification_request_not_pending");
            nonPendingJson.RootElement.GetProperty("data").GetProperty("currentStatus").GetString().Should().Be("Verified");
        }
    }

    [Fact]
    public async Task AppointmentsEndpoints_RejectPastManilaUtcOffsetAndDefault_WithHttp400ValidationError_AndAllowFutureOrGrace()
    {
        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        // FixedClock is 2026-11-19T06:00:00Z == 2026-11-19 14:00:00 Asia/Manila
        // 1. Past Unspecified Manila (13:50), Past UTC (05:50Z), Past +08:00 (13:54:59+08:00), and default -> 400 VALIDATION_ERROR ScheduledAt
        var invalidScheduledAtPayloads = new[]
        {
            new { patientId, patientName = "Maria Santos", doctorId, doctorName = "Dr. Reyes", scheduledAt = "2026-11-19T13:50:00", durationMinutes = 30 },
            new { patientId, patientName = "Maria Santos", doctorId, doctorName = "Dr. Reyes", scheduledAt = "2026-11-19T05:50:00Z", durationMinutes = 30 },
            new { patientId, patientName = "Maria Santos", doctorId, doctorName = "Dr. Reyes", scheduledAt = "2026-11-19T13:54:59+08:00", durationMinutes = 30 },
            new { patientId, patientName = "Maria Santos", doctorId, doctorName = "Dr. Reyes", scheduledAt = "0001-01-01T00:00:00", durationMinutes = 30 }
        };

        foreach (var body in invalidScheduledAtPayloads)
        {
            var resp = await _client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/appointments", body));
            resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("errorCode").GetString().Should().Be("VALIDATION_ERROR");
            doc.RootElement.GetProperty("errors")[0].GetProperty("field").GetString().Should().Be("ScheduledAt");
        }

        // 2. Within 5-minute grace window (05:55:00Z) -> 200 OK
        var graceCreateResp = await _client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/appointments", new
        {
            patientId,
            patientName = "Maria Santos",
            doctorId,
            doctorName = "Dr. Reyes",
            scheduledAt = "2026-11-19T05:55:00Z",
            durationMinutes = 30
        }));
        graceCreateResp.StatusCode.Should().Be(HttpStatusCode.OK);

        // 3. Valid future appointment -> 200 OK and returns Id
        var validCreateResp = await _client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/appointments", new
        {
            patientId,
            patientName = "Maria Santos",
            doctorId,
            doctorName = "Dr. Reyes",
            scheduledAt = "2026-11-19T15:30:00",
            durationMinutes = 30
        }));
        validCreateResp.StatusCode.Should().Be(HttpStatusCode.OK);
        Guid createdId;
        using (var doc = JsonDocument.Parse(await validCreateResp.Content.ReadAsStringAsync()))
        {
            createdId = doc.RootElement.GetProperty("data").GetProperty("id").GetGuid();
        }

        // 4. Reschedule with past timestamps -> 400 VALIDATION_ERROR NewScheduledAt
        foreach (var pastNewTime in new[] { "2026-11-19T13:50:00", "2026-11-19T05:50:00Z", "2026-11-19T13:54:59+08:00", "0001-01-01T00:00:00" })
        {
            var resp = await _client.SendAsync(CreateRequest(HttpMethod.Put, $"/api/v1/appointments/{createdId}/reschedule", new
            {
                newScheduledAt = pastNewTime
            }));
            resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("errorCode").GetString().Should().Be("VALIDATION_ERROR");
            doc.RootElement.GetProperty("errors")[0].GetProperty("field").GetString().Should().Be("NewScheduledAt");
        }

        // 5. Reschedule to valid future / grace -> 200 OK
        var validReschedResp = await _client.SendAsync(CreateRequest(HttpMethod.Put, $"/api/v1/appointments/{createdId}/reschedule", new
        {
            newScheduledAt = "2026-11-19T16:45:00"
        }));
        validReschedResp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task StaffStageOnlyPrcProofAndUpdate_PreservesVerifiedUntilResubmit_AndTransitionsOnPut()
    {
        var doctorId = Guid.NewGuid();
        var originalKey = $"tenants/{TenantId}/clinics/{_clinicId:D}/verification/prc/{doctorId:D}/old-proof.pdf";
        var originalExpiry = new DateOnly(2028, 6, 15);
        await DbAsync(async db =>
        {
            db.Settings.Add(new FacilitySettings
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                ClinicName = "StageOnly Test Clinic"
            });
            db.StaffMembers.Add(new StaffMember
            {
                Id = doctorId,
                TenantId = TenantId,
                ClinicId = _clinicId,
                FirstName = "Justine Mae",
                LastName = "Tabasan",
                Role = StaffRole.Doctor,
                PrcLicenseNumber = "0123456",
                PrcExpiryDate = originalExpiry,
                PrcEvidenceObjectKey = originalKey,
                VerificationContact = "justine@clinic.ph",
                IsDirectoryOptIn = true,
                CanonicalProviderId = Guid.NewGuid(),
                PublicVerificationStatus = PractitionerVerificationLevel.Verified,
                IsActive = true
            });
            await Task.CompletedTask;
        });

        // 1. Upload replacement PRC proof with ?stageOnly=true -> returns new objectKey without mutating staff
        using var form = new MultipartFormDataContent();
        var fileBytes = "%PDF-1.4\nnew-prc-proof"u8.ToArray();
        var fileContent = new ByteArrayContent(fileBytes);
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
        form.Add(fileContent, "file", "new-prc.pdf");

        var uploadReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/staff/{doctorId}/prc-proof?stageOnly=true")
        {
            Content = form
        };
        uploadReq.Headers.Add("X-Test-StaffId", _adminStaffId.ToString());
        var uploadResp = await _client.SendAsync(uploadReq);
        uploadResp.StatusCode.Should().Be(HttpStatusCode.OK);

        string stagedKey;
        using (var doc = JsonDocument.Parse(await uploadResp.Content.ReadAsStringAsync()))
        {
            stagedKey = doc.RootElement.GetProperty("data").GetProperty("objectKey").GetString()!;
        }
        stagedKey.Should().NotBeNullOrWhiteSpace();
        stagedKey.Should().NotBe(originalKey);

        var getBeforeSaveResp = await _client.SendAsync(CreateRequest(
            HttpMethod.Get,
            $"/api/v1/staff/{doctorId}",
            permissions: $"{ClinicPermissions.StaffRead},{ClinicPermissions.StaffManage}"));
        getBeforeSaveResp.StatusCode.Should().Be(HttpStatusCode.OK);
        using (var doc = JsonDocument.Parse(await getBeforeSaveResp.Content.ReadAsStringAsync()))
        {
            var data = doc.RootElement.GetProperty("data");
            data.GetProperty("prcEvidenceObjectKey").GetString().Should().Be(originalKey);
            data.GetProperty("publicVerificationStatus").GetString().Should().Be("Verified");
        }

        // 2. PUT /api/v1/staff/{id} commits staged key and transitions Verified -> PendingVerification
        var putResp = await _client.SendAsync(CreateRequest(HttpMethod.Put, $"/api/v1/staff/{doctorId}", new
        {
            firstName = "Justine Mae",
            lastName = "Tabasan",
            role = "Doctor",
            prcLicenseNumber = "0123456",
            isActive = true,
            isDirectoryOptIn = true,
            prcExpiryDate = "2028-06-15",
            prcEvidenceObjectKey = stagedKey,
            verificationContact = "justine@clinic.ph"
        }));
        putResp.StatusCode.Should().Be(HttpStatusCode.OK);
        using (var doc = JsonDocument.Parse(await putResp.Content.ReadAsStringAsync()))
        {
            var data = doc.RootElement.GetProperty("data");
            data.GetProperty("prcEvidenceObjectKey").GetString().Should().Be(stagedKey);
            data.GetProperty("publicVerificationStatus").GetString().Should().Be("PendingVerification");
        }
    }
}
