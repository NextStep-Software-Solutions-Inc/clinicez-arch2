using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Patient.Infrastructure.Services.Encryption;
using ClinicEz.Portal.Application;
using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ClinicPatient = ClinicEz.Clinic.Domain.Entities.Patient;
using PatientDbContext = ClinicEz.Patient.Infrastructure.Persistence.ApplicationDbContext;
using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;
using PortalDbContext = ClinicEz.Portal.Infrastructure.Persistence.ApplicationDbContext;
using PortalFacility = ClinicEz.Portal.Domain.Entities.Facility;
using PortalFacilityStatus = ClinicEz.Portal.Domain.Entities.FacilityStatus;
using PortalTenant = ClinicEz.Portal.Domain.Entities.Tenant;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Requirement-driven 4-tier E2E test suite for Issue #216 (Reject Past Same-Day Appointment Times).
/// Exercises real <c>Clinic.Application</c> FluentValidation + <c>ValidationBehavior</c>, <c>GlobalExceptionHandler</c>
/// HTTP 400 wire mapping, deterministic <see cref="TimeProvider"/> clock control, Asia/Manila timezone boundaries,
/// and cross-service Interop Hub alert delivery across <see cref="HubFixture"/> and <see cref="PatientHost"/>.
/// </summary>
public sealed class AppointmentScheduleE2ETests
{
    private sealed class ControllableTimeProvider(DateTimeOffset initialUtcNow) : TimeProvider
    {
        private DateTimeOffset _utcNow = initialUtcNow.ToUniversalTime();

        public override DateTimeOffset GetUtcNow() => _utcNow;

        public void SetUtcNow(DateTimeOffset utcNow) => _utcNow = utcNow.ToUniversalTime();

        public void Advance(TimeSpan delta) => _utcNow = _utcNow.Add(delta);
    }

    private sealed class AppointmentClinicHost : ServiceHostBase
    {
        public AmbientClinicContext Ambient { get; } = new();
        public ControllableTimeProvider Clock { get; }

        public AppointmentClinicHost(HubFixture hub, ControllableTimeProvider clock)
            : base(InteropServices.Clinic)
        {
            Clock = clock;
            var settings = BaseConfig(InteropServices.Clinic, "public");
            settings["Clinic:PortalBaseUrl"] = "https://clinic.e2e.test";
            settings["ClinicEncryption:MasterSecret"] = "e2e-clinic-encryption-master-secret-0123456789";
            var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

            var dbName = $"e2e-appt-clinic-{Guid.NewGuid():N}";
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddSingleton<IConfiguration>(config);
            services.AddSingleton<TimeProvider>(clock);
            ClinicEz.Clinic.Application.DependencyInjection.AddApplicationServices(services);
            ClinicEz.Clinic.Infrastructure.DependencyInjection.AddInfrastructureServices(services, config);

            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<ApplicationDbContext>>();
            services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
            services.RemoveAll<IClinicContext>();
            services.AddSingleton<IClinicContext>(Ambient);
            RouteHttpToHub(services, hub);

            Provider = services.BuildServiceProvider();
        }

        public async Task<T> AsStaffAsync<T>(string tenantId, Guid clinicId, Func<IServiceProvider, Task<T>> action, Guid? staffId = null)
        {
            using var scope = Provider.CreateScope();
            using var _ = Ambient.Enter(tenantId, clinicId, staffId);
            return await action(scope.ServiceProvider);
        }

        public Task<T> SendAsync<T>(string tenantId, Guid clinicId, IRequest<T> request, Guid? staffId = null) =>
            AsStaffAsync(tenantId, clinicId, sp => sp.GetRequiredService<ISender>().Send(request), staffId);

        public async Task<T> DbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
        {
            using var scope = Provider.CreateScope();
            return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
        }
    }

    private sealed class RecordingNotificationService : INotificationService
    {
        public List<(NotificationEmailRequestedPayload Payload, Guid CorrelationId)> Sent { get; } = [];

        public string EnqueueEmail(NotificationEmailRequestedPayload payload, Guid correlationId)
        {
            Sent.Add((payload, correlationId));
            return Guid.NewGuid().ToString("N");
        }
    }

    private sealed class FixedFrontendUrlProvider(string baseUrl) : IFrontendUrlProvider
    {
        public string? GetBaseUrl() => baseUrl;
        public string? GetAdminBaseUrl() => baseUrl;
    }

    private sealed class PortalVerificationSyncHost : ServiceHostBase
    {
        public RecordingNotificationService Notifications { get; } = new();

        public PortalVerificationSyncHost(HubFixture hub) : base(InteropServices.Portal)
        {
            var settings = BaseConfig(InteropServices.Portal, "public");
            var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
            var dbName = $"e2e-appt-portal-{Guid.NewGuid():N}";

            var services = new ServiceCollection();
            services.AddLogging();
            services.AddSingleton<IConfiguration>(config);
            services.AddDbContext<PortalDbContext>(o => o.UseInMemoryDatabase(dbName));
            services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<PortalDbContext>());
            services.TryAddSingleton(TimeProvider.System);
            services.AddSingleton<INotificationService>(Notifications);
            services.AddSingleton<IFrontendUrlProvider>(new FixedFrontendUrlProvider("https://portal.clinicez.ph"));
            services.AddScoped<IFacilityProvisioningPublisher, FacilityProvisioningPublisher>();
            services.AddScoped<IDirectoryVerificationSyncService, DirectoryVerificationSyncService>();
            ClinicEz.Portal.Application.DependencyInjection.AddApplicationServices(services);
            services.AddInterop<PortalDbContext>(config, handlers => handlers
                .Handle<FacilityProvisionedEvent, FacilityProvisionedHandler>(InteropTypes.FacilityProvisioned)
                .Handle<FacilityVerificationRequestedPayload, FacilityVerificationRequestedHandler>(InteropTypes.FacilityVerificationRequested)
                .Handle<FacilityVerificationWithdrawnPayload, FacilityVerificationWithdrawnHandler>(InteropTypes.FacilityVerificationWithdrawn)
                .Handle<PractitionerVerificationRequestedPayload, PractitionerVerificationRequestedHandler>(InteropTypes.PractitionerVerificationRequested)
                .Respond<FacilityVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload, FacilityVerificationUpdateRequestedResponder>(
                    InteropTypes.FacilityVerificationUpdateRequested, InteropTypes.FacilityVerificationUpdateResponded)
                .Respond<PractitionerVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload, PractitionerVerificationUpdateRequestedResponder>(
                    InteropTypes.PractitionerVerificationUpdateRequested, InteropTypes.PractitionerVerificationUpdateResponded));
            RouteHttpToHub(services, hub);

            Provider = services.BuildServiceProvider();
        }

        public async Task<T> SendAsync<T>(IRequest<T> request)
        {
            using var scope = Provider.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<ISender>().Send(request);
        }

        public async Task<T> DbAsync<T>(Func<PortalDbContext, Task<T>> action)
        {
            using var scope = Provider.CreateScope();
            return await action(scope.ServiceProvider.GetRequiredService<PortalDbContext>());
        }

        public async Task StageWorkspaceEligibilityAsync(Guid facilityId, bool eligible)
        {
            using var scope = Provider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PortalDbContext>();
            var publisher = scope.ServiceProvider.GetRequiredService<IFacilityProvisioningPublisher>();

            var facility = await db.Facilities
                .Include(f => f.Tenant)
                .FirstAsync(f => f.Id == facilityId);
            facility.IsPatientDiscoveryEligible = eligible;
            await publisher.StageDirectoryUpdateAsync(facility.Tenant, facility);
            await db.SaveChangesAsync();
        }
    }

    private sealed class NoOpPushNotificationService : IPushNotificationService
    {
        public Task SendPushNotificationAsync(string token, string title, string body, string action, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }

    private sealed class InMemoryPatientStorage : ClinicEz.Patient.Application.Common.Interfaces.IStorageService
    {
        private readonly Dictionary<string, byte[]> _blobs = new();

        public async Task<string> UploadAsync(Stream stream, string key, string contentType, CancellationToken cancellationToken = default)
        {
            using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer, cancellationToken);
            _blobs[key] = buffer.ToArray();
            return key;
        }

        public Task<string> SaveEncryptedAsync(string key, byte[] ciphertext, CancellationToken cancellationToken = default)
        {
            _blobs[key] = ciphertext;
            return Task.FromResult(key);
        }

        public async Task<string> SaveEncryptedStreamAsync(string key, Stream ciphertextStream, CancellationToken cancellationToken = default)
        {
            using var buffer = new MemoryStream();
            await ciphertextStream.CopyToAsync(buffer, cancellationToken);
            _blobs[key] = buffer.ToArray();
            return key;
        }

        public Task<byte[]> DownloadAsync(string key, CancellationToken cancellationToken = default) =>
            Task.FromResult(_blobs[key]);

        public Task<Stream> OpenReadStreamAsync(string key, CancellationToken cancellationToken = default) =>
            Task.FromResult<Stream>(new MemoryStream(_blobs[key]));

        public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
        {
            _blobs.Remove(key);
            return Task.CompletedTask;
        }

        public string GetPublicUrl(string key) => $"https://files.e2e.test/{key}";

        public Task<string> GeneratePresignedUploadUrlAsync(string key, string contentType, TimeSpan expiresIn, CancellationToken cancellationToken = default) =>
            Task.FromResult($"https://files.e2e.test/upload/{key}");

        public Task<string> GeneratePresignedDownloadUrlAsync(string key, TimeSpan expiresIn, CancellationToken cancellationToken = default) =>
            Task.FromResult($"https://files.e2e.test/{key}");

        public Task<bool> ObjectExistsAsync(string key, CancellationToken cancellationToken = default) =>
            Task.FromResult(_blobs.ContainsKey(key));
    }

    private sealed class AppointmentPatientHost : ServiceHostBase
    {
        public AppointmentPatientHost(HubFixture hub) : base(InteropServices.Patient)
        {
            var settings = BaseConfig(InteropServices.Patient, "public");
            settings["Sharing:SigningKey"] = PatientHost.SigningKey;
            settings["PatientEncryption:MasterSecret"] = "e2e-patient-encryption-master-secret-at-least-32-chars!";
            var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

            var dbName = $"e2e-appt-patient-{Guid.NewGuid():N}";
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddSingleton<IConfiguration>(config);
            services.AddDbContext<PatientDbContext>(o => o.UseInMemoryDatabase(dbName));
            services.AddScoped<IAppointmentRepository, AppointmentRepository>();
            services.AddScoped<IClinicRepository, ClinicRepository>();
            services.AddScoped<IPatientRepository, PatientRepository>();
            services.AddScoped<IBookingDraftRepository, BookingDraftRepository>();
            services.AddScoped<IClinicMembershipRepository, ClinicMembershipRepository>();
            services.AddScoped<ClinicEz.Patient.Domain.Interfaces.IUnitOfWork, ClinicEz.Patient.Infrastructure.Persistence.UnitOfWork>();
            services.AddScoped<IPatientAccessRepository, PatientAccessRepository>();
            services.AddScoped<IShareCodeRepository, ShareCodeRepository>();
            services.AddScoped<IShareCodeService, ShareCodeService>();
            services.AddScoped<IPatientDocumentRepository, PatientDocumentRepository>();
            services.AddScoped<INotificationRepository, NotificationRepository>();
            services.AddScoped<IDeviceSessionRepository, DeviceSessionRepository>();
            services.AddSingleton<IPushNotificationService, NoOpPushNotificationService>();
            services.AddSingleton<ClinicEz.Patient.Application.Common.Interfaces.IStorageService>(new InMemoryPatientStorage());
            services.AddSingleton(sp => PatientEncryptionKeyRing.FromConfiguration(sp.GetRequiredService<IConfiguration>()));
            services.AddScoped<IPatientEncryptionService, PatientEncryptionService>();
            services.Configure<SharingOptions>(o => o.SigningKey = PatientHost.SigningKey);
            ClinicEz.Patient.Application.DependencyInjection.AddApplicationServices(services);
            services.AddPatientInterop(config);
            RouteHttpToHub(services, hub);

            Provider = services.BuildServiceProvider();
        }

        public async Task<Guid> SeedPatientAsync(string first = "Elena", string last = "Diaz")
        {
            var id = Guid.NewGuid();
            await DbAsync(async db =>
            {
                db.Patients.Add(new PatientEntity
                {
                    Id = id,
                    ClerkUserId = $"clerk_{id:N}",
                    ClinicEzId = $"CE-{id.ToString("N")[..4].ToUpperInvariant()}-{id.ToString("N")[4..8].ToUpperInvariant()}",
                    FirstName = first,
                    LastName = last,
                    DateOfBirth = new DateOnly(1984, 3, 12),
                    Mobile = "0917-555-0199"
                });
                await db.SaveChangesAsync();
                return 0;
            });
            return id;
        }

        public async Task<T> DbAsync<T>(Func<PatientDbContext, Task<T>> action)
        {
            using var scope = Provider.CreateScope();
            return await action(scope.ServiceProvider.GetRequiredService<PatientDbContext>());
        }
    }

    private static async Task<(HubFixture Hub, AppointmentClinicHost Clinic, Fac Facility, ClinicPatient Patient, StaffMember Doctor)>
        CreateClinicHostWithPatientAndDoctorAsync(DateTimeOffset initialUtcNow)
    {
        var hub = HubFixture.Start();
        var clock = new ControllableTimeProvider(initialUtcNow);
        var clinic = new AppointmentClinicHost(hub, clock);
        var tenantId = Guid.NewGuid().ToString();
        var facility = Fac.Clinic(tenantId, "Manila Care Appointments Clinic");

        await hub.UpsertFacilityAsync(facility.Party, FacilityVisibility.Private, facility.Name, acceptsExternal: true);
        var envelope = InteropEnvelope.Create(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            facility.Party,
            Guid.NewGuid(),
            new FacilityCreatedEvent
            {
                TenantId = facility.Tenant,
                ResourceId = facility.Id,
                FacilityType = facility.Type,
                Name = facility.Name,
                LicenseToken = "e2e-license-token",
                PlanTier = "Pro"
            });
        var results = await hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);
        await Cell.PumpAsync([clinic]);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = facility.Tenant,
            ClinicId = facility.Id,
            FirstName = "Ana",
            LastName = "Cruz",
            Title = "Dr.",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0123456",
            Specialty = "Internal Medicine",
            IsActive = true
        };
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = facility.Tenant,
            ClinicId = facility.Id,
            PatientCode = $"PAT-{Guid.NewGuid().ToString("N")[..6]}",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "0917-123-4567",
            DateOfBirth = new DateOnly(1984, 3, 12),
            Sex = BiologicalSex.Female
        };

        await clinic.DbAsync(async db =>
        {
            db.StaffMembers.Add(doctor);
            db.Patients.Add(patient);
            await db.SaveChangesAsync();
            return 0;
        });

        return (hub, clinic, facility, patient, doctor);
    }

    private static async Task<(int StatusCode, string ContentType, JsonDocument Body)> InvokeGlobalExceptionHandlerAsync(
        Exception ex,
        string method = "POST",
        string path = "/api/v1/appointments")
    {
        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = path;
        context.Response.Body = new MemoryStream();

        var handler = new GlobalExceptionHandler();
        var handled = await handler.TryHandleAsync(context, ex, CancellationToken.None);
        handled.Should().BeTrue();

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var json = await new StreamReader(context.Response.Body).ReadToEndAsync();
        return (context.Response.StatusCode, context.Response.ContentType ?? string.Empty, JsonDocument.Parse(json));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 1 — Core Happy-Path & Baseline Rejection Checks (5 tests)
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Tier1_CreateAppointment_PastSameDay_ThrowsValidationExceptionAndMapsTo400()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero); // 14:00 Asia/Manila
        var (hub, clinic, facility, patient, doctor) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        clinic.Provider.GetRequiredService<TimeProvider>().Should().BeSameAs(clinic.Clock);

        var pastSameDayUtc = new DateTime(2026, 11, 19, 5, 30, 0, DateTimeKind.Utc); // 13:30 Manila (-30m)
        Func<Task> act = () => clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            PatientId: patient.Id,
            PatientName: "Maria Santos",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz",
            ScheduledAt: pastSameDayUtc));

        var ex = (await act.Should().ThrowAsync<ValidationException>()).Which;
        ex.Errors.Should().ContainKey(nameof(CreateAppointmentCommand.ScheduledAt));
        ex.Errors![nameof(CreateAppointmentCommand.ScheduledAt)]
            .Should().Contain(m => m.Contains("already passed", StringComparison.OrdinalIgnoreCase));

        var (status, _, body) = await InvokeGlobalExceptionHandlerAsync(ex, "POST", "/api/v1/appointments");
        using (body)
        {
            status.Should().Be(400);
            body.RootElement.GetProperty("succeeded").GetBoolean().Should().BeFalse();
            body.RootElement.GetProperty("errorCode").GetString().Should().Be("VALIDATION_ERROR");
            body.RootElement.GetProperty("errors")[0].GetProperty("field").GetString().Should().Be("ScheduledAt");
        }

        (await clinic.DbAsync(db => db.Appointments.IgnoreQueryFilters().CountAsync(a => a.ClinicId == facility.Id)))
            .Should().Be(0);
    }

    [Fact]
    public async Task Tier1_RescheduleAppointment_PastSameDay_ThrowsValidationExceptionAndPreservesOriginal()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero); // 14:00 Manila
        var (hub, clinic, facility, patient, doctor) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        var originalUtc = new DateTime(2026, 11, 19, 8, 0, 0, DateTimeKind.Utc); // 16:00 Manila
        var booked = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            PatientId: patient.Id,
            PatientName: "Maria Santos",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz",
            ScheduledAt: originalUtc));

        var pastSameDayUtc = new DateTime(2026, 11, 19, 5, 45, 0, DateTimeKind.Utc); // 13:45 Manila (-15m)
        Func<Task> act = () => clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(
            Id: booked.Id,
            NewScheduledAt: pastSameDayUtc));

        var ex = (await act.Should().ThrowAsync<ValidationException>()).Which;
        ex.Errors.Should().ContainKey(nameof(RescheduleAppointmentCommand.NewScheduledAt));
        ex.Errors![nameof(RescheduleAppointmentCommand.NewScheduledAt)]
            .Should().Contain(m => m.Contains("already passed", StringComparison.OrdinalIgnoreCase));

        var (status, _, body) = await InvokeGlobalExceptionHandlerAsync(ex, "PUT", $"/api/v1/appointments/{booked.Id}/reschedule");
        using (body)
        {
            status.Should().Be(400);
            body.RootElement.GetProperty("errorCode").GetString().Should().Be("VALIDATION_ERROR");
            body.RootElement.GetProperty("errors")[0].GetProperty("field").GetString().Should().Be("NewScheduledAt");
        }

        var persisted = await clinic.DbAsync(db => db.Appointments.IgnoreQueryFilters().SingleAsync(a => a.Id == booked.Id));
        persisted.ScheduledAt.Should().Be(originalUtc);
    }

    [Fact]
    public async Task Tier1_CreateAppointment_FutureTimeToday_SucceedsAndPersists()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero); // 14:00 Manila
        var (hub, clinic, facility, patient, doctor) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        var futureTodayUtc = new DateTime(2026, 11, 19, 7, 30, 0, DateTimeKind.Utc); // 15:30 Manila (+1h30m)
        var created = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            PatientId: patient.Id,
            PatientName: "Maria Santos",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz",
            ScheduledAt: futureTodayUtc,
            DurationMinutes: 45));

        created.ScheduledAt.Should().Be(futureTodayUtc);
        created.Status.Should().Be(AppointmentStatus.Confirmed);

        var persisted = await clinic.DbAsync(db => db.Appointments.IgnoreQueryFilters().SingleAsync(a => a.Id == created.Id));
        persisted.ScheduledAt.Should().Be(futureTodayUtc);
        persisted.EndTimeUtc.Should().Be(futureTodayUtc.AddMinutes(45));
    }

    [Fact]
    public async Task Tier1_RescheduleAppointment_FutureTimeToday_SucceedsAndUpdatesEndTime()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero); // 14:00 Manila
        var (hub, clinic, facility, patient, doctor) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        var initialUtc = new DateTime(2026, 11, 19, 7, 30, 0, DateTimeKind.Utc);
        var created = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            PatientId: patient.Id,
            PatientName: "Maria Santos",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz",
            ScheduledAt: initialUtc));

        var newFutureTodayUtc = new DateTime(2026, 11, 19, 9, 0, 0, DateTimeKind.Utc); // 17:00 Manila (+3h)
        var rescheduled = await clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(
            Id: created.Id,
            NewScheduledAt: newFutureTodayUtc,
            DurationMinutes: 30,
            Reason: "Patient requested later slot"));

        rescheduled.ScheduledAt.Should().Be(newFutureTodayUtc);
        var persisted = await clinic.DbAsync(db => db.Appointments.IgnoreQueryFilters().SingleAsync(a => a.Id == created.Id));
        persisted.ScheduledAt.Should().Be(newFutureTodayUtc);
        persisted.EndTimeUtc.Should().Be(newFutureTodayUtc.AddMinutes(30));
    }

    [Fact]
    public async Task Tier1_CreateAndReschedule_FutureDate_Succeeds()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero);
        var (hub, clinic, facility, patient, doctor) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        var tomorrowUtc = new DateTime(2026, 11, 20, 2, 0, 0, DateTimeKind.Utc); // 10:00 Manila next day
        var created = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            PatientId: patient.Id,
            PatientName: "Maria Santos",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz",
            ScheduledAt: tomorrowUtc));

        var threeDaysOutUtc = new DateTime(2026, 11, 22, 4, 0, 0, DateTimeKind.Utc);
        var rescheduled = await clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(
            Id: created.Id,
            NewScheduledAt: threeDaysOutUtc));

        rescheduled.ScheduledAt.Should().Be(threeDaysOutUtc);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 2 — Boundaries, Corner Cases & Wire Contracts (5 tests)
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Tier2_FiveMinuteGraceBoundaries_CreateAndReschedule()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero);
        var (hub, clinic, facility, patient, _) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        var minus5m01s = utcNow.UtcDateTime.AddMinutes(-5).AddSeconds(-1); // 05:54:59Z -> rejected
        var minus5m00s = utcNow.UtcDateTime.AddMinutes(-5);               // 05:55:00Z -> exact boundary allowed
        var minus4m59s = utcNow.UtcDateTime.AddMinutes(-5).AddSeconds(1);  // 05:55:01Z -> allowed
        var exactNow = utcNow.UtcDateTime;                                 // 06:00:00Z -> allowed

        // Create boundary checks
        Func<Task> createPast = () => clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, minus5m01s));
        (await createPast.Should().ThrowAsync<ValidationException>())
            .Which.Errors.Should().ContainKey("ScheduledAt");

        var c1 = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, minus5m00s));
        c1.ScheduledAt.Should().Be(minus5m00s);

        var c2 = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, minus4m59s));
        c2.ScheduledAt.Should().Be(minus4m59s);

        var c3 = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, exactNow));
        c3.ScheduledAt.Should().Be(exactNow);

        // Reschedule boundary checks
        Func<Task> reschedPast = () => clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(
            c3.Id, minus5m01s));
        (await reschedPast.Should().ThrowAsync<ValidationException>())
            .Which.Errors.Should().ContainKey("NewScheduledAt");

        var r1 = await clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(c3.Id, minus5m00s));
        r1.ScheduledAt.Should().Be(minus5m00s);

        var r2 = await clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(c3.Id, minus4m59s));
        r2.ScheduledAt.Should().Be(minus4m59s);

        var r3 = await clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(c3.Id, exactNow));
        r3.ScheduledAt.Should().Be(exactNow);
    }

    [Fact]
    public async Task Tier2_ManilaMidnightCrossUtcDay_UnspecifiedTimestamps()
    {
        // 2026-11-18T16:02:00Z == 2026-11-19 00:02:00 Asia/Manila (UTC+8)
        var utcNow = new DateTimeOffset(2026, 11, 18, 16, 2, 0, TimeSpan.Zero);
        var (hub, clinic, facility, patient, _) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        // Unspecified timestamps represent Asia/Manila wall-clock time
        var manila2355PrevDay = new DateTime(2026, 11, 18, 23, 55, 0, DateTimeKind.Unspecified); // 15:55Z (-7m) -> reject
        var manila2359PrevDay = new DateTime(2026, 11, 18, 23, 59, 0, DateTimeKind.Unspecified); // 15:59Z (-3m) -> allow
        var manila0001NextDay = new DateTime(2026, 11, 19, 0, 1, 0, DateTimeKind.Unspecified);  // 16:01Z (-1m) -> allow
        var manila0010NextDay = new DateTime(2026, 11, 19, 0, 10, 0, DateTimeKind.Unspecified); // 16:10Z (+8m) -> allow

        Func<Task> pastPrevDay = () => clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, manila2355PrevDay));
        (await pastPrevDay.Should().ThrowAsync<ValidationException>())
            .Which.Errors.Should().ContainKey("ScheduledAt");

        var appt1 = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, manila2359PrevDay));
        appt1.ScheduledAt.Should().Be(new DateTime(2026, 11, 18, 15, 59, 0, DateTimeKind.Utc));

        var appt2 = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, manila0001NextDay));
        appt2.ScheduledAt.Should().Be(new DateTime(2026, 11, 18, 16, 1, 0, DateTimeKind.Utc));

        var appt3 = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, manila0010NextDay));
        appt3.ScheduledAt.Should().Be(new DateTime(2026, 11, 18, 16, 10, 0, DateTimeKind.Utc));

        // Advance clock to 16:10Z (00:10 Manila): 00:01 Manila is now -9m -> rejected!
        clinic.Clock.SetUtcNow(new DateTimeOffset(2026, 11, 18, 16, 10, 0, TimeSpan.Zero));
        Func<Task> reschedPast = () => clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(
            appt3.Id, manila0001NextDay));
        (await reschedPast.Should().ThrowAsync<ValidationException>())
            .Which.Errors.Should().ContainKey("NewScheduledAt");
    }

    [Fact]
    public async Task Tier2_DefaultDateTime_CreateAndReschedule_RejectedWith400ValidationError()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero);
        var (hub, clinic, facility, patient, _) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        Func<Task> createDefault = () => clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, default(DateTime)));
        var createEx = (await createDefault.Should().ThrowAsync<ValidationException>()).Which;
        createEx.Errors!["ScheduledAt"].Should().ContainSingle().Which.Should().Contain("required");

        var valid = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", null, null, utcNow.UtcDateTime.AddHours(1)));

        Func<Task> reschedDefault = () => clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(
            valid.Id, default(DateTime)));
        var reschedEx = (await reschedDefault.Should().ThrowAsync<ValidationException>()).Which;
        reschedEx.Errors!["NewScheduledAt"].Should().ContainSingle().Which.Should().Contain("required");
    }

    [Fact]
    public async Task Tier2_GlobalExceptionHandler_ValidationErrorWireJson_MatchesContract()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero);
        var (hub, clinic, facility, patient, _) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        ValidationException? caught = null;
        try
        {
            await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
                patient.Id, "Maria Santos", null, null, utcNow.UtcDateTime.AddMinutes(-30)));
        }
        catch (ValidationException ex)
        {
            caught = ex;
        }

        caught.Should().NotBeNull();
        var (status, contentType, body) = await InvokeGlobalExceptionHandlerAsync(caught!);
        using (body)
        {
            status.Should().Be(400);
            contentType.Should().StartWith("application/json");
            var root = body.RootElement;
            root.GetProperty("succeeded").GetBoolean().Should().BeFalse();
            root.GetProperty("errorCode").GetString().Should().Be("VALIDATION_ERROR");
            root.GetProperty("traceId").GetString().Should().NotBeNullOrWhiteSpace();
            var errors = root.GetProperty("errors");
            errors.GetArrayLength().Should().Be(1);
            errors[0].GetProperty("field").GetString().Should().Be("ScheduledAt");
            errors[0].GetProperty("code").GetString().Should().Be("VALIDATION_ERROR");
            errors[0].GetProperty("message").GetString().Should().Contain("already passed");
        }
    }

    [Fact]
    public async Task Tier2_DoctorCollisionVsPastValidation_ValidationRunsBeforeCollision409()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero);
        var (hub, clinic, facility, patient, doctor) = await CreateClinicHostWithPatientAndDoctorAsync(utcNow);
        await using var _hub = hub;
        using var _clinic = clinic;

        var slotUtc = new DateTime(2026, 11, 19, 8, 0, 0, DateTimeKind.Utc);
        await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", doctor.Id, "Dr. Ana Cruz", slotUtc));

        // Past time (even with same doctor) must fail in ValidationBehavior (400), not handler (409)
        Func<Task> pastAttempt = () => clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", doctor.Id, "Dr. Ana Cruz", new DateTime(2026, 11, 19, 5, 0, 0, DateTimeKind.Utc)));
        await pastAttempt.Should().ThrowAsync<ValidationException>();

        // Overlapping future time passes ValidationBehavior and hits handler doctor collision (409 ConflictException)
        Func<Task> overlappingFuture = () => clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            patient.Id, "Maria Santos", doctor.Id, "Dr. Ana Cruz", slotUtc.AddMinutes(15)));
        await overlappingFuture.Should().ThrowAsync<ConflictException>();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 3 & TIER 4 — Cross-Service Interop & End-to-End Scenarios
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Tier3_VerifiedClinic_AppointmentSchedule_ValidationFailure_EmitsZeroInteropOutbox()
    {
        var utcNow = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero);
        await using var hub = HubFixture.Start();
        var clock = new ControllableTimeProvider(utcNow);
        using var clinic = new AppointmentClinicHost(hub, clock);
        using var patientHost = new PatientHost(hub);

        var tenantId = Guid.NewGuid().ToString();
        var facility = Fac.Clinic(tenantId, "Verified Outbox Guard Clinic");
        await hub.UpsertFacilityAsync(facility.Party, FacilityVisibility.Private, facility.Name, acceptsExternal: true);
        var env = InteropEnvelope.Create(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            facility.Party,
            Guid.NewGuid(),
            new FacilityCreatedEvent
            {
                TenantId = facility.Tenant,
                ResourceId = facility.Id,
                FacilityType = facility.Type,
                Name = facility.Name,
                LicenseToken = "e2e-license-token",
                PlanTier = "Pro"
            });
        (await hub.NewSdk(InteropServices.Portal).SendAsync([env], CancellationToken.None))
            .Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);
        await Cell.PumpAsync([clinic, patientHost]);

        var cloudPatientId = await PatientSeed.AccountAsync(patientHost);
        var clinicPatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = facility.Tenant,
            ClinicId = facility.Id,
            PatientCode = "PAT-GUARD1",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "0917-123-4567",
            CloudPatientId = cloudPatientId
        };
        await clinic.DbAsync(async db =>
        {
            db.Patients.Add(clinicPatient);
            await db.SaveChangesAsync();
            return 0;
        });

        var baselineOutboxCount = (await clinic.OutboxAsync()).Count;

        Func<Task> act = () => clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            clinicPatient.Id, "Maria Santos", null, null, utcNow.UtcDateTime.AddMinutes(-20)));
        await act.Should().ThrowAsync<ValidationException>();

        (await clinic.OutboxAsync()).Should().HaveCount(baselineOutboxCount, "failed appointment validation must emit zero Interop outbox messages");
        (await hub.DbAsync(db => db.Messages.CountAsync(m => m.Type == InteropTypes.PatientAppointmentAlert))).Should().Be(0);
    }

    [Fact]
    public async Task Tier4_04_VerifiedClinic_Book_ClockAdvance_PastRescheduleRejected_FutureRescheduleEmitsInterop()
    {
        var initialUtc = new DateTimeOffset(2026, 11, 19, 6, 0, 0, TimeSpan.Zero); // 14:00 Manila
        await using var hub = HubFixture.Start();
        var clock = new ControllableTimeProvider(initialUtc);
        using var clinic = new AppointmentClinicHost(hub, clock);
        using var portal = new PortalVerificationSyncHost(hub);
        using var patientHost = new AppointmentPatientHost(hub);

        // 1. Provision and verify clinic through real Portal <-> Hub <-> Clinic <-> Patient flow
        var tenantId = Guid.NewGuid();
        var facility = Fac.Clinic(tenantId.ToString(), "Manila Heart & Care Clinic");
        await portal.DbAsync(async db =>
        {
            db.Tenants.Add(new PortalTenant
            {
                Id = tenantId,
                TenantSlug = "manila-heart-care",
                Name = "Manila Heart Workspace",
                OwnerId = "owner_manila_heart",
                Email = "owner@manilaheart.ph",
                City = "Manila",
                Province = "Metro Manila"
            });
            db.Facilities.Add(new PortalFacility
            {
                Id = facility.Id,
                TenantId = tenantId,
                Name = facility.Name,
                Slug = "manila-heart-care",
                FacilityType = FacilityType.Clinic,
                Status = PortalFacilityStatus.Provisioning,
                IsPatientDiscoveryEligible = true,
                PlatformVerificationStatus = PlatformVerificationStatus.Unverified,
                City = "Manila",
                Province = "Metro Manila",
                StreetAddress = "100 Taft Ave"
            });
            await db.SaveChangesAsync();
            return 0;
        });

        await hub.UpsertFacilityAsync(facility.Party, FacilityVisibility.Private, facility.Name, acceptsExternal: true);
        var provisionEnv = InteropEnvelope.Create(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            facility.Party,
            Guid.NewGuid(),
            new FacilityCreatedEvent
            {
                TenantId = facility.Tenant,
                ResourceId = facility.Id,
                FacilityType = facility.Type,
                Name = facility.Name,
                LicenseToken = "e2e-license-token",
                PlanTier = "Pro"
            });
        (await hub.NewSdk(InteropServices.Portal).SendAsync([provisionEnv], CancellationToken.None))
            .Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);
        await Cell.PumpAsync([clinic, patientHost, portal]);

        await portal.StageWorkspaceEligibilityAsync(facility.Id, true);
        await Cell.PumpAsync([clinic, patientHost, portal]);

        var doctorId = Guid.NewGuid();
        await clinic.DbAsync(async db =>
        {
            var settings = await db.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == facility.Id);
            settings.OperatingHours = "Mon-Sat 08:00-18:00";
            settings.LetterheadAddress = "100 Taft Ave, Manila";
            settings.LetterheadContact = "0917-555-0100";
            settings.LetterheadDohLto = "DOH-LTO-2026-216";
            settings.LtoEvidenceObjectKey = "verification/lto/216.pdf";

            db.StaffMembers.Add(new StaffMember
            {
                Id = doctorId,
                TenantId = facility.Tenant,
                ClinicId = facility.Id,
                FirstName = "Rafael",
                LastName = "Mendoza",
                Title = "Dr.",
                Role = StaffRole.Doctor,
                PrcLicenseNumber = "0071234",
                Specialty = "Cardiology",
                IsActive = true
            });
            db.ServiceItems.Add(new ServiceItem
            {
                Id = Guid.NewGuid(),
                TenantId = facility.Tenant,
                ClinicId = facility.Id,
                Code = "CON-216",
                Name = "Cardiology Consultation",
                Category = "Consultation",
                StandardPrice = 800m,
                IsActive = true
            });
            await db.SaveChangesAsync();
            return 0;
        });

        await clinic.SendAsync(facility.Tenant, facility.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([clinic, patientHost, portal]);

        var facReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == facility.Id));
        await portal.SendAsync(new ApproveVerificationRequestCommand(facReq.Id, "admin_1", "Verifier One", "Approved"));
        await Cell.PumpAsync([clinic, patientHost, portal]);

        // 2. Link a patient-app user and book an appointment for 14:30 Manila (06:30Z)
        var cloudPatientId = await patientHost.SeedPatientAsync("Elena", "Diaz");
        var clinicPatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = facility.Tenant,
            ClinicId = facility.Id,
            PatientCode = "PAT-T404",
            FirstName = "Elena",
            LastName = "Diaz",
            ContactNumber = "0917-123-4567",
            CloudPatientId = cloudPatientId
        };
        await clinic.DbAsync(async db =>
        {
            db.Patients.Add(clinicPatient);
            await db.SaveChangesAsync();
            return 0;
        });

        var slot1430ManilaUtc = new DateTime(2026, 11, 19, 6, 30, 0, DateTimeKind.Utc);
        var booked = await clinic.SendAsync(facility.Tenant, facility.Id, new CreateAppointmentCommand(
            PatientId: clinicPatient.Id,
            PatientName: "Elena Diaz",
            DoctorId: doctorId,
            DoctorName: "Dr. Rafael Mendoza",
            ScheduledAt: slot1430ManilaUtc));

        await Cell.PumpAsync([clinic, patientHost, portal]);

        var patientNotificationsAfterBook = await patientHost.DbAsync(db =>
            db.Notifications.AsNoTracking().Where(n => n.PatientId == cloudPatientId).ToListAsync());
        patientNotificationsAfterBook.Should().ContainSingle(n => n.SourceId == $"appointment:{booked.Id}:{AppointmentAlertKinds.Booked}");
        (await clinic.OutboxAsync()).Count(o => o.Type == InteropTypes.CommsEligibilityGranted).Should().Be(1);

        // 3. Advance clock +40m to 14:40 Manila (06:40Z); 14:30 Manila is now -10m past -> reschedule blocked with 0 duplicate Interop
        clock.Advance(TimeSpan.FromMinutes(40));
        var alertCountBeforeInvalid = (await clinic.OutboxAsync()).Count(o => o.Type == InteropTypes.PatientAppointmentAlert);

        Func<Task> invalidReschedule = () => clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(
            booked.Id, slot1430ManilaUtc));
        (await invalidReschedule.Should().ThrowAsync<ValidationException>())
            .Which.Errors.Should().ContainKey("NewScheduledAt");

        (await clinic.OutboxAsync()).Count(o => o.Type == InteropTypes.PatientAppointmentAlert).Should().Be(alertCountBeforeInvalid);

        // 4. Reschedule to 16:00 Manila (08:00Z) -> succeeds and emits PatientAppointmentAlert ("rescheduled") + CommsEligibilityGranted v2
        var slot1600ManilaUtc = new DateTime(2026, 11, 19, 8, 0, 0, DateTimeKind.Utc);
        var rescheduled = await clinic.SendAsync(facility.Tenant, facility.Id, new RescheduleAppointmentCommand(
            booked.Id, slot1600ManilaUtc, Reason: "Moved to afternoon"));
        rescheduled.ScheduledAt.Should().Be(slot1600ManilaUtc);

        await Cell.PumpAsync([clinic, patientHost, portal]);

        var patientNotificationsAfterResched = await patientHost.DbAsync(db =>
            db.Notifications.AsNoTracking().Where(n => n.PatientId == cloudPatientId).ToListAsync());
        patientNotificationsAfterResched.Should().ContainSingle(n => n.SourceId == $"appointment:{booked.Id}:{AppointmentAlertKinds.Rescheduled}");
        (await clinic.OutboxAsync()).Count(o => o.Type == InteropTypes.CommsEligibilityGranted).Should().Be(2);

        await clinic.AssertNothingStuckAsync();
        await patientHost.AssertNothingStuckAsync();
        await portal.AssertNothingStuckAsync();
    }
}
