using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Features.Schedules.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Patient.Infrastructure.Services.Search;
using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PortalDbContext = ClinicEz.Portal.Infrastructure.Persistence.ApplicationDbContext;
using PortalFacility = ClinicEz.Portal.Domain.Entities.Facility;
using PortalFacilityStatus = ClinicEz.Portal.Domain.Entities.FacilityStatus;
using PortalTenant = ClinicEz.Portal.Domain.Entities.Tenant;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Requirement-driven 4-tier E2E suite for Issue #218 (In-Place Pending Verification Sync &amp; 409 Optimistic Concurrency)
/// and Issue #217 (Verification Detail Enrichment, Service Expansion, Name Resolution &amp; Resubmission Diff)
/// across real signed Interop Hub envelopes (<see cref="ClinicHost"/> &lt;-&gt; <see cref="HubFixture"/> &lt;-&gt;
/// <see cref="PortalVerificationSyncHost"/> &lt;-&gt; <see cref="PatientHost"/>).
/// </summary>
public sealed class DirectoryVerificationSyncAndEnrichmentE2ETests
{
    private const int MaxEnvelopeBytes = 8 * 1024 * 1024;
    private static readonly TimeSpan SyncPumpLimit = TimeSpan.FromSeconds(15);
    private static readonly byte[] SamplePdfBytes = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"u8.ToArray();

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
            var dbName = $"e2e-portal-sync-{Guid.NewGuid():N}";

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

    private static Task<T> PumpClinicCallAsync<T>(TestCell cell, PortalVerificationSyncHost portal, Task<T> call) =>
        Cell.PumpUntilAsync([cell.Clinic, portal, cell.Patient], call, SyncPumpLimit);

    private static async Task<Fac> ProvisionClinicAsync(
        TestCell cell,
        PortalVerificationSyncHost portal,
        string tenantSlug,
        string facilityName,
        bool isPatientDiscoveryEligible = true,
        bool teleconsultEnabled = false,
        bool branchPhilHealthAccredited = false,
        string? branchPhilHealthNumber = null)
    {
        var tenantId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var fac = Fac.Clinic(tenantId.ToString(), facilityName);

        await portal.DbAsync(async db =>
        {
            var tenant = new PortalTenant
            {
                Id = tenantId,
                TenantSlug = tenantSlug,
                Name = $"{facilityName} Workspace",
                OwnerId = $"owner_{tenantSlug}",
                FirstName = "Workspace",
                LastName = "Owner",
                Email = $"owner@{tenantSlug}.ph",
                City = "Manila",
                Province = "Metro Manila"
            };
            var branch = new Branch
            {
                Id = branchId,
                TenantId = tenantId,
                Name = $"{facilityName} Main Branch",
                IsActive = true,
                ContactNumber = "02-8000-1111",
                ContactEmail = $"branch@{tenantSlug}.ph",
                IsPhilHealthAccredited = branchPhilHealthAccredited,
                PhilHealthAccreditationNumber = branchPhilHealthNumber
            };
            var facility = new PortalFacility
            {
                Id = fac.Id,
                TenantId = tenantId,
                BranchId = branchId,
                Name = fac.Name,
                Slug = tenantSlug,
                FacilityType = FacilityType.Clinic,
                Status = PortalFacilityStatus.Provisioning,
                IsPatientDiscoveryEligible = isPatientDiscoveryEligible,
                PlatformVerificationStatus = PlatformVerificationStatus.Unverified,
                City = "Manila",
                Province = "Metro Manila",
                StreetAddress = $"100 {facilityName} Ave"
            };
            db.Tenants.Add(tenant);
            db.Branches.Add(branch);
            db.Facilities.Add(facility);
            if (teleconsultEnabled)
            {
                db.WorkspaceTeleconsultBillings.Add(new WorkspaceTeleconsultBilling
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    IsEnabled = true,
                    BillingMode = WorkspaceTeleconsultBilling.ModePostpaid
                });
            }
            await db.SaveChangesAsync();
            return 0;
        });

        await cell.ProvisionAsync(fac);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        if (isPatientDiscoveryEligible)
        {
            await portal.StageWorkspaceEligibilityAsync(fac.Id, true);
            await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        }

        return fac;
    }

    private static async Task SeedClinicOperationalSetupAsync(
        TestCell cell,
        Fac clinic,
        string dohLtoNumber = "DOH-LTO-2026-001",
        string? ltoEvidenceObjectKey = "verification/lto/clinic-lto-v1.pdf",
        DateOnly? dohLtoExpiryDate = null,
        bool teleconsultEntitled = false,
        int seedServicesCount = 1)
    {
        var payload = new FacilityLicensePayload
        {
            FacilityId = clinic.Id,
            TenantId = clinic.Tenant,
            FacilityName = clinic.Name,
            FacilityType = nameof(FacilityType.Clinic),
            PlanTier = "Pro",
            Limits = new FacilityLimits { MaxStaff = 25 },
            EnabledFeatures = teleconsultEntitled ? [FacilityFeatureKeys.Teleconsultation] : [],
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        };
        var licenseToken = new FacilityLicenseSigner().SignLicense(payload);

        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == clinic.Id);
            settings.LicenseToken = licenseToken;
            settings.MaxStaffLimit = 25;
            settings.OperatingHours = "Mon-Sat 08:00-17:00";
            settings.LetterheadAddress = $"100 {clinic.Name} Ave, Manila";
            settings.LetterheadContact = "0917-555-0100";
            settings.LetterheadDohLto = dohLtoNumber;
            settings.DohLtoExpiryDate = dohLtoExpiryDate;
            settings.LtoEvidenceObjectKey = ltoEvidenceObjectKey;

            for (var i = 1; i <= seedServicesCount; i++)
            {
                db.ServiceItems.Add(new ServiceItem
                {
                    Id = Guid.NewGuid(),
                    TenantId = clinic.Tenant,
                    ClinicId = clinic.Id,
                    Code = $"SVC-{i:D2}-{clinic.Id.ToString("N")[..4]}",
                    Name = i == 1 ? "General Consultation" : $"Specialty Service {i:D2}",
                    Category = i % 2 == 0 ? "Diagnostics" : "Consultation",
                    StandardPrice = 500m + (i * 50m),
                    IsActive = true
                });
            }

            await db.SaveChangesAsync();
            return 0;
        });
    }

    private static async Task<ClinicEz.Clinic.Application.Features.Staff.DTOs.StaffMemberDto> CreateOptedInDoctorAsync(
        TestCell cell,
        Fac clinic,
        string firstName,
        string lastName,
        string prc,
        string email,
        string specialty = "Internal Medicine",
        string bio = "Board-certified specialist.",
        string? prcEvidenceObjectKey = null,
        bool isOptedIn = true)
    {
        return await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateStaffMemberCommand(
            FirstName: firstName,
            LastName: lastName,
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: email,
            PhoneNumber: null,
            PrcLicenseNumber: prc,
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: specialty,
            InitialPassword: "ClinicPass2026!",
            IsDirectoryOptIn: isOptedIn,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: prcEvidenceObjectKey ?? $"verification/prc/{firstName.ToLowerInvariant()}-{lastName.ToLowerInvariant()}-v1.pdf",
            VerificationContact: email,
            PublicBio: bio));
    }

    private static async Task SeedWeeklyScheduleAsync(
        TestCell cell,
        Fac clinic,
        Guid staffId,
        string doctorName,
        DayOfWeek dayOfWeek,
        TimeOnly start,
        TimeOnly end)
    {
        await cell.Clinic.DbAsync(async db =>
        {
            db.DoctorScheduleTemplates.Add(new DoctorScheduleTemplate
            {
                Id = Guid.NewGuid(),
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                DoctorId = staffId,
                DoctorName = doctorName,
                DayOfWeek = dayOfWeek,
                StartTime = start,
                EndTime = end,
                SlotDurationMinutes = 30,
                EffectiveStartDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-7)),
                IsActive = true
            });
            await db.SaveChangesAsync();
            return 0;
        });
    }

    private static Task<ClinicEz.Patient.Application.Common.DTOs.DirectorySearchResponseDto> SearchDirectoryAsync(
        TestCell cell,
        string? query = null,
        string category = "all") =>
        cell.Patient.DbAsync(db =>
            new DirectoryCatalogSearchService(db, TimeProvider.System)
                .SearchAsync(patientId: null, query: query, category: category));

    private static async Task AssertAllHubEnvelopesAreObjectKeyOnlyAndCompactAsync(HubFixture hub)
    {
        new HubOptions().MaxEnvelopeBytes.Should().Be(MaxEnvelopeBytes);

        var messages = await hub.DbAsync(db => db.Messages.AsNoTracking().ToListAsync());
        messages.Should().NotBeEmpty();

        foreach (var msg in messages)
        {
            var byteCount = Encoding.UTF8.GetByteCount(msg.Envelope);
            byteCount.Should().BeLessThan(MaxEnvelopeBytes);
            byteCount.Should().BeLessThan(64 * 1024, $"object-key-only envelope {msg.Type} should stay lightweight");
            msg.Envelope.Should().NotContain("data:image/");
            msg.Envelope.Should().NotContain("%PDF-");
        }
    }

    private static async Task<(int StatusCode, JsonDocument Body)> InvokeGlobalExceptionHandlerAsync(Exception ex)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = "PUT";
        context.Request.Path = "/api/v1/clinic-settings/directory-publishing/pending";
        context.Response.Body = new MemoryStream();

        var handler = new GlobalExceptionHandler();
        (await handler.TryHandleAsync(context, ex, CancellationToken.None)).Should().BeTrue();
        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var json = await new StreamReader(context.Response.Body).ReadToEndAsync();
        return (context.Response.StatusCode, JsonDocument.Parse(json));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 1 — Core Happy-Path & Baseline Contract Checks (10 tests: 5 #218 + 5 #217)
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Tier1_218_01_FacilityPendingInPlaceSync_UpdatesSnapshotAndPreservesSingleRow()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "inplace-fac", "Ermita Medical Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic, "DOH-LTO-100", "verification/lto/ermita-v1.pdf");
        var submitter = await CreateOptedInDoctorAsync(cell, clinic, "Elena", "Reyes", "0099100", "elena@ermita.ph");

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true), submitter.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var initialReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        initialReq.SubmissionNumber.Should().Be(1);
        initialReq.RequestKind.Should().Be("Initial");
        initialReq.Status.Should().Be("PendingReview");

        // Update clinic info, hours, LTO expiry, LTO proof, and add a service, then trigger explicit pending sync
        var newExpiry = new DateOnly(2029, 12, 31);
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            ClinicName: "Ermita Prime Medical Center",
            OperatingHours: "Mon-Sun 07:00-21:00",
            LetterheadContact: "+639171234567",
            DohLtoExpiryDate: newExpiry,
            SkipPendingVerificationSync: true), submitter.Id);

        var ltoUpload = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadLtoProofCommand(
            "ermita-lto-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes, SkipPendingVerificationSync: true), submitter.Id);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicServiceItemCommand(
            "LAB-CBC", "Complete Blood Count", "Laboratory", 450m, SkipPendingVerificationSync: true), submitter.Id);

        var syncCall = cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand(), submitter.Id);
        var syncResult = await PumpClinicCallAsync(cell, portal, syncCall);
        syncResult.Success.Should().BeTrue();
        syncResult.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.PendingReview);

        // Must preserve single FacilityVerificationRequest row (0 duplicate Withdrawn rows)
        var allFacilityRequests = await portal.DbAsync(db =>
            db.FacilityVerificationRequests.Where(r => r.FacilityId == clinic.Id).ToListAsync());
        allFacilityRequests.Should().ContainSingle();
        allFacilityRequests[0].Id.Should().Be(initialReq.Id);
        allFacilityRequests[0].SubmissionNumber.Should().Be(1);
        allFacilityRequests[0].RequestKind.Should().Be("Initial");
        allFacilityRequests[0].Status.Should().Be("PendingReview");
        allFacilityRequests[0].UpdatedAt.Should().NotBeNull();

        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(initialReq.Id));
        detail.Should().NotBeNull();
        detail!.DohLtoExpiryDate.Should().Be(newExpiry);
        detail.ClinicContactNumber.Should().Be("+639171234567");
        detail.LtoEvidenceObjectKey.Should().Be(ltoUpload.ObjectKey);
        detail.UpdatedAtUtc.Should().NotBeNull();
        detail.Snapshot!.Value.GetProperty("facilityName").GetString().Should().Be("Ermita Prime Medical Center");
        detail.Snapshot.Value.GetProperty("operatingHours").GetString().Should().Be("Mon-Sun 07:00-21:00");
        detail.Snapshot.Value.GetProperty("services").GetArrayLength().Should().Be(2);

        var audits = await portal.DbAsync(db =>
            db.WorkspaceAuditEntries.Where(a => a.TenantId == Guid.Parse(clinic.Tenant)).Select(a => a.Action).ToListAsync());
        audits.Should().Contain("facility-pending-updated");
    }

    [Fact]
    public async Task Tier1_218_02_PractitionerPendingInPlaceSync_UpdatesSnapshotAndPreservesSingleRow()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "inplace-prac", "Makati Specialist Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        var doc = await CreateOptedInDoctorAsync(cell, clinic, "Carlo", "Villanueva", "0055101", "carlo@makati.ph",
            specialty: "General Practice", bio: "Initial bio.");
        await SeedWeeklyScheduleAsync(cell, clinic, doc.Id, "Dr. Carlo Villanueva", DayOfWeek.Monday, new TimeOnly(8, 0), new TimeOnly(12, 0));

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SubmitPractitionerVerificationCommand(doc.Id), doc.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var pracReq = await portal.DbAsync(db =>
            db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == doc.Id));
        pracReq.SubmissionNumber.Should().Be(1);
        pracReq.Status.Should().Be("PendingReview");

        var newPrcExpiry = new DateOnly(2030, 8, 15);
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            Id: doc.Id,
            FirstName: "Carlo",
            LastName: "Villanueva",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "carlo@makati.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "0055101",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Pulmonology",
            IsActive: true,
            IsDirectoryOptIn: true,
            PrcExpiryDate: newPrcExpiry,
            VerificationContact: "carlo@makati.ph",
            PublicBio: "Updated pulmonologist bio.",
            SkipPendingVerificationSync: true), doc.Id);

        var prcUpload = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadStaffPrcProofCommand(
            doc.Id, "carlo-prc-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes, SkipPendingVerificationSync: true), doc.Id);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpsertDoctorScheduleTemplateCommand(
            doc.Id, "Dr. Carlo Villanueva", DayOfWeek.Wednesday, new TimeOnly(13, 0), new TimeOnly(17, 0), SkipPendingVerificationSync: true), doc.Id);

        var syncCall = cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingPractitionerVerificationCommand(doc.Id), doc.Id);
        var updatedStaff = await PumpClinicCallAsync(cell, portal, syncCall);
        updatedStaff.Specialty.Should().Be("Pulmonology");

        var allPracRequests = await portal.DbAsync(db =>
            db.PractitionerVerificationRequests.Where(r => r.ClinicStaffMemberId == doc.Id).ToListAsync());
        allPracRequests.Should().ContainSingle();
        allPracRequests[0].Id.Should().Be(pracReq.Id);
        allPracRequests[0].SubmissionNumber.Should().Be(1);
        allPracRequests[0].Status.Should().Be("PendingReview");
        allPracRequests[0].UpdatedAt.Should().NotBeNull();

        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(pracReq.Id));
        detail.Should().NotBeNull();
        detail!.PrcEvidenceObjectKey.Should().Be(prcUpload.ObjectKey);
        detail.UpdatedAtUtc.Should().NotBeNull();
        var child = detail.ChildPractitionerRequests.Should().ContainSingle().Subject;
        child.Specialty.Should().Be("Pulmonology");
        child.PublicBio.Should().Be("Updated pulmonologist bio.");
        child.PrcExpiryDate.Should().Be(newPrcExpiry);
        child.Availabilities.Should().HaveCount(2);
    }

    [Fact]
    public async Task Tier1_218_03_TerminalImmutability_FacilityApproved_Throws409AndSnapshotUntouched()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "approved-lock", "Approved Lock Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic, "DOH-LTO-LOCK-1");
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061234", "ana@lock.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var req = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        await portal.SendAsync(new ApproveVerificationRequestCommand(req.Id, "admin_1", "Verifier One", "Approved"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var approvedSnapshotBefore = (await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.Id == req.Id))).SubmittedSnapshotJson;

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            OperatingHours: "Mon-Sun 00:00-23:59",
            LetterheadDohLto: "DOH-LTO-MUTATED"));

        Func<Task> act = () => cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand());
        var ex = (await act.Should().ThrowAsync<VerificationConflictException>()).Which;
        VerificationConflictException.ErrorCode.Should().Be("verification_request_not_pending");
        ex.CurrentStatus.Should().Be("Verified");

        // Also confirm Portal responder returns Conflict=true / verification_request_not_pending if called directly while Approved
        var reqClient = cell.Clinic.Provider.GetRequiredService<IInteropRequestClient>();
        var wireCall = reqClient.RequestAsync<FacilityVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>(
            InteropTypes.FacilityVerificationUpdateRequested,
            InteropTypes.FacilityVerificationUpdateResponded,
            clinic.Party,
            Party.Portal,
            new FacilityVerificationUpdateRequestedPayload
            {
                TenantId = clinic.Tenant,
                FacilityId = clinic.Id,
                FacilityName = clinic.Name,
                ExpectedRequestId = req.Id
            },
            timeout: TimeSpan.FromSeconds(10));
        var wireReply = await PumpClinicCallAsync(cell, portal, wireCall);
        wireReply.Succeeded.Should().BeFalse();
        wireReply.Conflict.Should().BeTrue();
        wireReply.ErrorCode.Should().Be("verification_request_not_pending");
        wireReply.CurrentStatus.Should().Be("Approved");

        var approvedSnapshotAfter = (await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.Id == req.Id))).SubmittedSnapshotJson;
        approvedSnapshotAfter.Should().Be(approvedSnapshotBefore);
    }

    [Fact]
    public async Task Tier1_218_04_ExplicitPendingSync_PortalOffline_Throws503ServiceUnavailable()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "offline-503", "Offline 503 Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        await CreateOptedInDoctorAsync(cell, clinic, "Marco", "Tan", "0088123", "marco@503.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // Portal omitted from PumpUntilAsync -> 15s SyncRequestTimeout triggers ServiceUnavailableException (503)
        var call = cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand());
        Func<Task> act = () => Cell.PumpUntilAsync([cell.Clinic], call, TimeSpan.FromSeconds(25));

        var ex = (await act.Should().ThrowAsync<ServiceUnavailableException>()).Which;
        var (status, body) = await InvokeGlobalExceptionHandlerAsync(ex);
        using (body)
        {
            status.Should().Be(503);
            body.RootElement.GetProperty("errorCode").GetString().Should().Be("SERVICE_UNAVAILABLE");
        }
    }

    [Fact]
    public async Task Tier1_218_05_SubmitPractitionerVerification_WhenAlreadyPending_Throws409Conflict()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "dup-prac-409", "Duplicate Submit Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        var doc = await CreateOptedInDoctorAsync(cell, clinic, "Liza", "Santos", "0077221", "liza@dup.ph");

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SubmitPractitionerVerificationCommand(doc.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        Func<Task> secondSubmit = () => cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SubmitPractitionerVerificationCommand(doc.Id));
        var ex = (await secondSubmit.Should().ThrowAsync<VerificationConflictException>()).Which;
        VerificationConflictException.ErrorCode.Should().Be("verification_request_not_pending");
        ex.CurrentStatus.Should().Be("PendingVerification");
    }

    [Fact]
    public async Task Tier1_217_01_ServiceExpansion_MoreThan9Services_AllReturnedWithoutTruncation()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "svc-expand-12", "Twelve Services Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic, seedServicesCount: 12);
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061200", "ana@12svc.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var req = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(req.Id));
        detail.Should().NotBeNull();

        var servicesEl = detail!.Snapshot!.Value.GetProperty("services");
        servicesEl.GetArrayLength().Should().Be(12, "services list must not be truncated at 9");
        var names = servicesEl.EnumerateArray().Select(s => s.GetProperty("name").GetString()).ToList();
        names.Should().Contain("General Consultation");
        names.Should().Contain("Specialty Service 12");
    }

    [Fact]
    public async Task Tier1_217_02_HumanReadableSubmittedByAndReviewedByNames_FacilityAndPractitioner()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "names-human", "Human Names Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        var doc = await CreateOptedInDoctorAsync(cell, clinic, "Elena", "Reyes", "0099881", "elena@names.ph", isOptedIn: false);

        await portal.DbAsync(async db =>
        {
            db.AdminUsers.Add(new AdminUser
            {
                Id = Guid.NewGuid(),
                ClerkUserId = "clerk_verifier",
                Email = "verifier@clinicez.ph",
                FullName = "Directory Verifier",
                RoleId = Guid.NewGuid()
            });
            await db.SaveChangesAsync();
            return 0;
        });

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true), doc.Id);
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SubmitPractitionerVerificationCommand(doc.Id), doc.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var facReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var pracReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id && r.FacilityVerificationRequestId == null));

        await portal.SendAsync(new ApproveVerificationRequestCommand(facReq.Id, "clerk_verifier", "Directory Verifier", "Looks good", AdminEmail: "verifier@clinicez.ph"));
        await portal.SendAsync(new ApproveVerificationRequestCommand(pracReq.Id, "clerk_verifier", "Directory Verifier", "PRC verified", AdminEmail: "verifier@clinicez.ph"));

        var queue = await portal.SendAsync(new GetVerificationQueueQuery());
        queue.Items.Should().Contain(i => i.Id == facReq.Id && i.SubmittedByDisplayName == "Dr. Elena Reyes" && i.ReviewedByDisplayName == "Directory Verifier" && i.ReviewedByEmail == "verifier@clinicez.ph");
        queue.Items.Should().Contain(i => i.Id == pracReq.Id && i.SubmittedByDisplayName == "Dr. Elena Reyes" && i.ReviewedByDisplayName == "Directory Verifier" && i.ReviewedByEmail == "verifier@clinicez.ph");

        var facDetail = await portal.SendAsync(new GetVerificationRequestDetailQuery(facReq.Id));
        facDetail!.SubmittedByDisplayName.Should().Be("Dr. Elena Reyes");
        facDetail.ReviewedByDisplayName.Should().Be("Directory Verifier");
        facDetail.ReviewedByEmail.Should().Be("verifier@clinicez.ph");
        facDetail.SubmissionHistory.Should().ContainSingle().Which.ReviewedByDisplayName.Should().Be("Directory Verifier");

        var pracDetail = await portal.SendAsync(new GetVerificationRequestDetailQuery(pracReq.Id));
        pracDetail!.SubmittedByDisplayName.Should().Be("Dr. Elena Reyes");
        pracDetail.ReviewedByDisplayName.Should().Be("Directory Verifier");
        pracDetail.ReviewedByEmail.Should().Be("verifier@clinicez.ph");
        pracDetail.SubmissionHistory.Should().ContainSingle().Which.ReviewedByDisplayName.Should().Be("Directory Verifier");
    }

    [Fact]
    public async Task Tier1_217_03_MetadataEnrichment_DohLtoExpiry_Phone_PhilHealth_ConsultationModes()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "meta-217", "Metadata Enriched Clinic", teleconsultEnabled: true);
        var ltoExpiry = new DateOnly(2029, 6, 30);
        await SeedClinicOperationalSetupAsync(cell, clinic, "DOH-LTO-META-1", dohLtoExpiryDate: ltoExpiry, teleconsultEntitled: true);
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061235", "ana@meta.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            LetterheadContact: "+639175551234",
            AccreditationNumber: "PH-YAKAP-9001",
            EnableTeleconsultation: true,
            DohLtoExpiryDate: ltoExpiry));
        await cell.Clinic.DbAsync(async db =>
        {
            var s = await db.Settings.IgnoreQueryFilters().FirstAsync(x => x.ClinicId == clinic.Id);
            s.IsPhilHealthConfigured = true;
            await db.SaveChangesAsync();
            return 0;
        });

        var readiness = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new GetClinicPublishingReadinessQuery());
        readiness.DohLtoExpiryDate.Should().Be(ltoExpiry);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var req = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var queue = await portal.SendAsync(new GetVerificationQueueQuery());
        queue.Items.Should().ContainSingle(i => i.Id == req.Id && i.DohLtoExpiryDate == ltoExpiry);

        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(req.Id));
        detail.Should().NotBeNull();
        detail!.DohLtoExpiryDate.Should().Be(ltoExpiry);
        detail.ClinicContactNumber.Should().Be("+639175551234");
        detail.PhilHealthAccreditationNumber.Should().Be("PH-YAKAP-9001");
        detail.IsPhilHealthAccredited.Should().BeTrue();
        detail.SupportsInPerson.Should().BeTrue();
        detail.SupportsTeleconsult.Should().BeTrue();

        await portal.SendAsync(new ApproveVerificationRequestCommand(req.Id, "admin_1", "Verifier One", "Approved"));
        var facilities = await portal.SendAsync(new GetFacilitiesQuery("meta-217"));
        facilities.Should().ContainSingle(f => f.Id == clinic.Id && f.LtoExpiryDate == ltoExpiry);
    }

    [Fact]
    public async Task Tier1_217_04_FacilityResubmissionDiff_ShowsChangedFieldsAndLtoProofUpdated()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "fac-diff", "Facility Diff Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic, "DOH-LTO-001", "verification/lto/diff-v1.pdf");
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061236", "ana@diff.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var sub1 = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        await portal.SendAsync(new RejectVerificationRequestCommand(sub1.Id, "admin_1", "Verifier One", "LTO blurred"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            LetterheadDohLto: "DOH-LTO-002",
            OperatingHours: "Mon-Sun 08:00-20:00"));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadLtoProofCommand(
            "diff-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes));

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var sub2 = await portal.DbAsync(db =>
            db.FacilityVerificationRequests.Where(r => r.FacilityId == clinic.Id).OrderBy(r => r.SubmissionNumber).LastAsync());
        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(sub2.Id));
        detail!.ResubmissionDiff.Should().NotBeNull();
        detail.ResubmissionDiff!.PreviousRequestId.Should().Be(sub1.Id);
        detail.ResubmissionDiff.PreviousSubmissionNumber.Should().Be(1);
        detail.ResubmissionDiff.PreviousStatus.Should().Be("Rejected");
        detail.ResubmissionDiff.PreviousReason.Should().Be("LTO blurred");
        detail.ResubmissionDiff.LtoProofUpdated.Should().BeTrue();
        detail.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "dohLtoNumber" && c.ChangeKind == "Modified");
        detail.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "operatingHours" && c.ChangeKind == "Modified");
    }

    [Fact]
    public async Task Tier1_217_05_PractitionerResubmissionDiff_ShowsChangedFieldsAndPrcProofUpdated()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "prac-diff", "Practitioner Diff Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        var doc = await CreateOptedInDoctorAsync(cell, clinic, "Jose", "Rizal", "0071111", "jose@diff.ph",
            specialty: "General Medicine", bio: "Original bio");

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SubmitPractitionerVerificationCommand(doc.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var pracSub1 = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == doc.Id));
        await portal.SendAsync(new RejectVerificationRequestCommand(pracSub1.Id, "admin_1", "Verifier One", "PRC expired"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var updatedExpiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(4));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            Id: doc.Id,
            FirstName: "Jose",
            LastName: "Rizal",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "jose@diff.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "0071111",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Ophthalmology",
            IsActive: true,
            IsDirectoryOptIn: true,
            PrcExpiryDate: updatedExpiry,
            VerificationContact: "jose@diff.ph",
            PublicBio: "Updated ophthalmology bio"));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadStaffPrcProofCommand(
            doc.Id, "jose-prc-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes));

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SubmitPractitionerVerificationCommand(doc.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var pracSub2 = await portal.DbAsync(db =>
            db.PractitionerVerificationRequests.Where(r => r.ClinicStaffMemberId == doc.Id).OrderBy(r => r.SubmissionNumber).LastAsync());
        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(pracSub2.Id));
        detail!.ResubmissionDiff.Should().NotBeNull();
        detail.ResubmissionDiff!.PreviousSubmissionNumber.Should().Be(1);
        detail.ResubmissionDiff.PreviousStatus.Should().Be("Rejected");
        detail.ResubmissionDiff.PreviousReason.Should().Be("PRC expired");
        detail.ResubmissionDiff.PrcProofUpdated.Should().BeTrue();
        detail.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "prcExpiryDate");
        detail.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "specialty");
        detail.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "publicBio");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 2 — Boundaries, Corner Cases & Edge Conditions (11 tests: 6 #218 + 5 #217)
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Tier2_218_01_PractitionerExpectedStatusNull_AwaitingOtp_PreservesTokenOnNonIdentityEdit_AndReissuesOnContactChange()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinicNorth = await ProvisionClinicAsync(cell, portal, "otp-north", "North Clinic");
        var clinicSouth = await ProvisionClinicAsync(cell, portal, "otp-south", "South Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinicNorth, "DOH-LTO-N");
        await SeedClinicOperationalSetupAsync(cell, clinicSouth, "DOH-LTO-S");

        var docNorth = await CreateOptedInDoctorAsync(cell, clinicNorth, "Elena", "Reyes", "0099887", "elena.north@clinicez.ph");
        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new SubmitPractitionerVerificationCommand(docNorth.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        var northReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == docNorth.Id));
        await portal.SendAsync(new ApproveVerificationRequestCommand(northReq.Id, "admin_1", "Verifier One", "Approved"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // South submits matching PRC "99887" -> AwaitingOtp + 1 email
        var docSouth = await CreateOptedInDoctorAsync(cell, clinicSouth, "Elena", "Reyes", "99887", "elena.south@clinicez.ph");
        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new SubmitPractitionerVerificationCommand(docSouth.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var southReq1 = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == docSouth.Id));
        southReq1.Status.Should().Be("AwaitingOtp");
        var initialTokenHash = southReq1.OtpTokenHash;
        initialTokenHash.Should().NotBeNullOrWhiteSpace();
        portal.Notifications.Sent.Should().ContainSingle();

        // Action A: Non-identity edit (specialty + bio + PRC proof) -> ExpectedStatus=null preserves OTP token & emits 0 duplicate emails
        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new UpdateStaffMemberCommand(
            Id: docSouth.Id,
            FirstName: "Elena",
            LastName: "Reyes",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "elena.south@clinicez.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "99887",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Preventive Cardiology",
            IsActive: true,
            IsDirectoryOptIn: true,
            PrcExpiryDate: docSouth.PrcExpiryDate,
            PrcEvidenceObjectKey: "verification/prc/elena-south-v2.pdf",
            VerificationContact: "elena.south@clinicez.ph",
            PublicBio: "Updated South bio.",
            SkipPendingVerificationSync: true));

        await PumpClinicCallAsync(cell, portal,
            cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new UpdatePendingPractitionerVerificationCommand(docSouth.Id)));

        var southReqAfterNonIdentity = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.Id == southReq1.Id));
        southReqAfterNonIdentity.Status.Should().Be("AwaitingOtp");
        southReqAfterNonIdentity.OtpTokenHash.Should().Be(initialTokenHash);
        portal.Notifications.Sent.Should().HaveCount(1, "non-identity edits must not send duplicate OTP emails");

        // Action B: Verification contact change -> reissues fresh OTP token & email
        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new UpdateStaffMemberCommand(
            Id: docSouth.Id,
            FirstName: "Elena",
            LastName: "Reyes",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "elena.south@clinicez.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "99887",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Preventive Cardiology",
            IsActive: true,
            IsDirectoryOptIn: true,
            PrcExpiryDate: docSouth.PrcExpiryDate,
            PrcEvidenceObjectKey: "verification/prc/elena-south-v2.pdf",
            VerificationContact: "new.elena@clinicez.ph",
            PublicBio: "Updated South bio.",
            SkipPendingVerificationSync: true));

        await PumpClinicCallAsync(cell, portal,
            cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new UpdatePendingPractitionerVerificationCommand(docSouth.Id)));

        var southReqAfterContactChange = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.Id == southReq1.Id));
        southReqAfterContactChange.Status.Should().Be("AwaitingOtp");
        southReqAfterContactChange.OtpTokenHash.Should().NotBe(initialTokenHash);
        portal.Notifications.Sent.Should().HaveCount(2);
        portal.Notifications.Sent[1].Payload.To.Should().Be("new.elena@clinicez.ph");
    }

    [Fact]
    public async Task Tier2_218_02_AllTerminalStates_Approved_Rejected_Withdrawn_Superseded_BlockInPlaceUpdateWithConflict()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinicApproved = await ProvisionClinicAsync(cell, portal, "term-approved", "Approved Clinic");
        var clinicRejected = await ProvisionClinicAsync(cell, portal, "term-rejected", "Rejected Clinic");
        var clinicWithdrawn = await ProvisionClinicAsync(cell, portal, "term-withdrawn", "Withdrawn Clinic");
        var clinicSuperseded = await ProvisionClinicAsync(cell, portal, "term-superseded", "Superseded Clinic");

        foreach (var c in new[] { clinicApproved, clinicRejected, clinicWithdrawn, clinicSuperseded })
        {
            await SeedClinicOperationalSetupAsync(cell, c);
            await CreateOptedInDoctorAsync(cell, c, "Ana", "Cruz", $"006{c.Id.ToString("N")[..4]}", $"ana@{c.Id:N}.ph", isOptedIn: false);
            await cell.Clinic.SendAsync(c.Tenant, c.Id, new PublishClinicToDirectoryCommand(true));
        }
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var approvedReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinicApproved.Id));
        await portal.SendAsync(new ApproveVerificationRequestCommand(approvedReq.Id, "admin_1", "Verifier One", "Approved"));

        var rejectedReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinicRejected.Id));
        await portal.SendAsync(new RejectVerificationRequestCommand(rejectedReq.Id, "admin_1", "Verifier One", "Rejected"));

        await cell.Clinic.SendAsync(clinicWithdrawn.Tenant, clinicWithdrawn.Id, new WithdrawFacilityVerificationCommand("Withdrawn"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        var withdrawnReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinicWithdrawn.Id));

        // Superseded: resubmit facility #2 so #1 becomes Superseded
        var supersededReq1 = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinicSuperseded.Id));
        await portal.DbAsync(async db =>
        {
            var r1 = await db.FacilityVerificationRequests.SingleAsync(r => r.Id == supersededReq1.Id);
            r1.Status = "Superseded";
            await db.SaveChangesAsync();
            return 0;
        });

        var reqClient = cell.Clinic.Provider.GetRequiredService<IInteropRequestClient>();
        var cases = new[]
        {
            (Clinic: clinicApproved, ReqId: approvedReq.Id, ExpectedStatus: "Approved"),
            (Clinic: clinicRejected, ReqId: rejectedReq.Id, ExpectedStatus: "Rejected"),
            (Clinic: clinicWithdrawn, ReqId: withdrawnReq.Id, ExpectedStatus: "Withdrawn"),
            (Clinic: clinicSuperseded, ReqId: supersededReq1.Id, ExpectedStatus: "Superseded")
        };

        foreach (var item in cases)
        {
            var call = reqClient.RequestAsync<FacilityVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>(
                InteropTypes.FacilityVerificationUpdateRequested,
                InteropTypes.FacilityVerificationUpdateResponded,
                item.Clinic.Party,
                Party.Portal,
                new FacilityVerificationUpdateRequestedPayload
                {
                    TenantId = item.Clinic.Tenant,
                    FacilityId = item.Clinic.Id,
                    FacilityName = item.Clinic.Name,
                    ExpectedRequestId = item.ReqId
                },
                timeout: TimeSpan.FromSeconds(10));

            var reply = await PumpClinicCallAsync(cell, portal, call);
            reply.Succeeded.Should().BeFalse();
            reply.Conflict.Should().BeTrue();
            reply.ErrorCode.Should().Be("verification_request_not_pending");
            reply.CurrentStatus.Should().Be(item.ExpectedStatus);
        }
    }

    [Fact]
    public async Task Tier2_218_03_PreferencesJsonAutoSave_EmitsZeroInteropSyncMessages()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "prefs-autosave", "AutoSave Isolation Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        var doc = await CreateOptedInDoctorAsync(cell, clinic, "Carlo", "Mendoza", "0054321", "carlo@autosave.ph");

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var outboxBefore = (await cell.Clinic.OutboxAsync()).Count;

        // 1. Doctor updates ONLY PreferencesJson (simulating 450ms UI preference auto-save)
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateMyProfileCommand(
            StaffId: doc.Id,
            FirstName: doc.FirstName,
            LastName: doc.LastName,
            MiddleName: doc.MiddleName,
            Title: doc.Title,
            PhoneNumber: doc.PhoneNumber,
            PrcLicenseNumber: doc.PrcLicenseNumber,
            PtrNumber: doc.PtrNumber,
            S2LicenseNumber: doc.S2LicenseNumber,
            Specialty: doc.Specialty,
            PhilHealthPan: doc.PhilHealthPan,
            PreferencesJson: "{\"theme\":\"teal\",\"sidebarCollapsed\":true}",
            IsDirectoryOptIn: doc.IsDirectoryOptIn,
            PrcExpiryDate: doc.PrcExpiryDate,
            PrcEvidenceObjectKey: doc.PrcEvidenceObjectKey,
            VerificationContact: doc.VerificationContact,
            PublicBio: doc.PublicBio,
            AvatarUrl: doc.AvatarUrl), doc.Id);

        // 2. Clinic updates ONLY non-directory field QueuePrefix
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(QueuePrefix: "QP"));

        var newOutbox = (await cell.Clinic.OutboxAsync()).Skip(outboxBefore).ToList();
        newOutbox.Should().NotContain(o =>
            o.Type == InteropTypes.FacilityVerificationUpdateRequested
            || o.Type == InteropTypes.PractitionerVerificationUpdateRequested);
    }

    [Fact]
    public async Task Tier2_218_04_ImplicitSyncOfflineFallback_CommitsLocalDbFirstAndDrainsViaOutbox()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "offline-fallback", "Offline Fallback Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061239", "ana@fallback.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // Portal offline: implicit UpdateClinicSettingsCommand (throwOnConflict: false) times out on sync request
        // and falls back to transactional outbox WITHOUT throwing 503, while local DB is already committed.
        var call = cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            OperatingHours: "Mon-Sun 06:00-22:00",
            SkipPendingVerificationSync: false));
        var dto = await Cell.PumpUntilAsync([cell.Clinic], call, TimeSpan.FromSeconds(25));
        dto.OperatingHours.Should().Be("Mon-Sun 06:00-22:00");

        var localSettings = await cell.Clinic.DbAsync(db => db.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == clinic.Id));
        localSettings.OperatingHours.Should().Be("Mon-Sun 06:00-22:00");

        (await cell.Clinic.OutboxAsync()).Should().Contain(o => o.Type == InteropTypes.FacilityVerificationUpdateRequested);

        // Portal comes back online -> outbox drains and updates pending request in place
        await Cell.PumpAsync([cell.Clinic, portal, cell.Patient]);

        var portalReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(portalReq.Id));
        detail!.Snapshot!.Value.GetProperty("operatingHours").GetString().Should().Be("Mon-Sun 06:00-22:00");
        await cell.Clinic.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task Tier2_218_05_SkipPendingVerificationSyncFlag_SuppressesImplicitSyncAcrossMutations()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "skip-sync", "Skip Sync Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        var doc = await CreateOptedInDoctorAsync(cell, clinic, "Marco", "Tan", "0088222", "marco@skipsync.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SubmitPractitionerVerificationCommand(doc.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var outboxBefore = (await cell.Clinic.OutboxAsync()).Count;

        // Direct await (without pumping!) proves SkipPendingVerificationSync=true does not issue synchronous Interop calls
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            OperatingHours: "Mon-Fri 09:00-18:00", SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadLtoProofCommand(
            "skip-lto.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes, SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicServiceItemCommand(
            "SKIP-SVC", "Skip Service", "General", 300m, SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            doc.Id, "Marco", "Tan", null, "Dr.", StaffRole.Doctor, null, "marco@skipsync.ph", null, "0088222", null, null,
            "Neurology", true, IsDirectoryOptIn: true, PrcExpiryDate: doc.PrcExpiryDate, VerificationContact: "marco@skipsync.ph",
            SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadStaffPrcProofCommand(
            doc.Id, "skip-prc.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes, SkipPendingVerificationSync: true));

        var newOutbox = (await cell.Clinic.OutboxAsync()).Skip(outboxBefore).ToList();
        newOutbox.Should().BeEmpty();

        // Now perform single consolidated explicit sync for facility & practitioner
        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand()));
        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingPractitionerVerificationCommand(doc.Id)));

        var facReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var facDetail = await portal.SendAsync(new GetVerificationRequestDetailQuery(facReq.Id));
        facDetail!.Snapshot!.Value.GetProperty("operatingHours").GetString().Should().Be("Mon-Fri 09:00-18:00");
        facDetail.Snapshot.Value.GetProperty("services").GetArrayLength().Should().Be(2);
    }

    [Fact]
    public async Task Tier2_218_06_ClearDohLtoExpiryDate_And_PhilHealthOverrideIsolation()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "clear-lto-ph", "Clear LTO & Override Clinic",
            branchPhilHealthAccredited: false, branchPhilHealthNumber: null);
        await SeedClinicOperationalSetupAsync(cell, clinic, dohLtoExpiryDate: new DateOnly(2029, 6, 30));
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061240", "ana@clear.ph", isOptedIn: false);

        await cell.Clinic.DbAsync(async db =>
        {
            var s = await db.Settings.IgnoreQueryFilters().FirstAsync(x => x.ClinicId == clinic.Id);
            s.IsPhilHealthOverridden = true;
            s.AccreditationNumber = null;
            s.BranchPhilHealthAccreditationNumber = "BR-999";
            await db.SaveChangesAsync();
            return 0;
        });

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            ClearDohLtoExpiryDate: true)));

        var localSettings = await cell.Clinic.DbAsync(db => db.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == clinic.Id));
        localSettings.DohLtoExpiryDate.Should().BeNull();

        var facReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(facReq.Id));
        detail!.DohLtoExpiryDate.Should().BeNull();
        detail.PhilHealthAccreditationNumber.Should().BeNull("overridden clinic without AccreditationNumber must not leak branch fallback");
    }

    [Fact]
    public async Task Tier2_217_01_ServiceExpansion_19PlusServices_AndServiceDiffOnResubmission()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "svc-19-plus", "Nineteen Plus Services Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic, seedServicesCount: 19);
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061241", "ana@19svc.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var sub1 = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        await portal.SendAsync(new RejectVerificationRequestCommand(sub1.Id, "admin_1", "Verifier One", "Update fee schedule"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // Deactivate 1st service, update 2nd service, add 2 new services -> 20 active services
        var existingServices = await cell.Clinic.DbAsync(db =>
            db.ServiceItems.IgnoreQueryFilters().Where(s => s.ClinicId == clinic.Id).OrderBy(s => s.Code).ToListAsync());
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicServiceItemCommand(
            existingServices[0].Id, existingServices[0].Name, existingServices[0].Category, existingServices[0].StandardPrice, IsActive: false));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicServiceItemCommand(
            existingServices[1].Id, "Updated Specialty Service 02", existingServices[1].Category, 999m, IsActive: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicServiceItemCommand("SVC-20", "Service Twenty", "Lab", 700m));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicServiceItemCommand("SVC-21", "Service Twenty-One", "Lab", 800m));

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var sub2 = await portal.DbAsync(db =>
            db.FacilityVerificationRequests.Where(r => r.FacilityId == clinic.Id).OrderBy(r => r.SubmissionNumber).LastAsync());
        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(sub2.Id));
        detail!.Snapshot!.Value.GetProperty("services").GetArrayLength().Should().Be(20);
        detail.ResubmissionDiff!.ChangedFields.Should().ContainSingle(c =>
            c.FieldKey == "services"
            && c.PreviousValue == "19 service(s)"
            && c.CurrentValue == "20 service(s) (+2 added, 1 updated, -1 removed)");
    }

    [Fact]
    public async Task Tier2_217_02_LegacyRawUserIds_BlockedAndResolvedViaFallbackChain()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var tenantId = Guid.NewGuid();
        var facilityId = Guid.NewGuid();
        var reqClerkId = Guid.NewGuid();
        var reqGuidId = Guid.NewGuid();

        await portal.DbAsync(async db =>
        {
            db.Tenants.Add(new PortalTenant
            {
                Id = tenantId,
                TenantSlug = "legacy-ids",
                Name = "Legacy IDs Workspace",
                OwnerId = "owner_legacy",
                Email = "owner@legacy.ph"
            });
            db.Facilities.Add(new PortalFacility
            {
                Id = facilityId,
                TenantId = tenantId,
                Name = "Legacy Clinic",
                Slug = "legacy-ids",
                FacilityType = FacilityType.Clinic,
                Status = PortalFacilityStatus.Active
            });
            db.WorkspaceMembers.Add(new WorkspaceMember
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                UserId = "user_2abcXYZ",
                Email = "claire@legacy.ph",
                FullName = "Dr. Claire Santos",
                Role = WorkspaceMemberRole.Admin,
                Status = MemberStatus.Active
            });
            var guidUserId = Guid.NewGuid().ToString();
            db.WorkspaceMembers.Add(new WorkspaceMember
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                UserId = guidUserId,
                Email = "ben@legacy.ph",
                FullName = "Ben Dela Cruz",
                Role = WorkspaceMemberRole.Member,
                Status = MemberStatus.Active
            });
            db.AdminUsers.Add(new AdminUser
            {
                Id = Guid.NewGuid(),
                ClerkUserId = "admin_clerk_1",
                Email = "verifier@clinicez.ph",
                FullName = "Directory Verifier",
                RoleId = Guid.NewGuid()
            });
            db.FacilityVerificationRequests.Add(new FacilityVerificationRequest
            {
                Id = reqClerkId,
                TenantId = tenantId,
                FacilityId = facilityId,
                SubmissionNumber = 1,
                CorrelationId = facilityId.ToString(),
                RequestKind = "Initial",
                SubmittedByClinicUserId = "user_2abcXYZ",
                SubmittedByDisplayName = "user_2abcXYZ",
                SubmittedSnapshotJson = "{\"facilityName\":\"Legacy Clinic\"}",
                Status = "Approved",
                ReviewedByAdminUserId = "VERIFIER@CLINICEZ.PH",
                ReviewedAtUtc = DateTime.UtcNow
            });
            db.PractitionerVerificationRequests.Add(new PractitionerVerificationRequest
            {
                Id = reqGuidId,
                TenantId = tenantId,
                FacilityId = facilityId,
                ClinicStaffMemberId = Guid.NewGuid(),
                SubmissionNumber = 1,
                CorrelationId = Guid.NewGuid().ToString(),
                RequestKind = "Initial",
                ProfessionKind = "Doctor",
                SubmittedPrcLicenseNo = "0011999",
                NormalizedPrcLicenseNo = "0011999",
                SubmittedByClinicUserId = guidUserId,
                SubmittedByDisplayName = guidUserId,
                SubmittedSnapshotJson = "{\"firstName\":\"Ben\",\"lastName\":\"Dela Cruz\"}",
                Status = "PendingReview"
            });
            await db.SaveChangesAsync();
            return 0;
        });

        var queue = await portal.SendAsync(new GetVerificationQueueQuery());
        queue.Items.Should().Contain(i => i.Id == reqClerkId
            && i.SubmittedByDisplayName == "Dr. Claire Santos"
            && i.ReviewedByDisplayName == "Directory Verifier");
        queue.Items.Should().Contain(i => i.Id == reqGuidId && i.SubmittedByDisplayName == "Ben Dela Cruz");

        var facDetail = await portal.SendAsync(new GetVerificationRequestDetailQuery(reqClerkId));
        facDetail!.SubmittedByDisplayName.Should().Be("Dr. Claire Santos");
        facDetail.ReviewedByDisplayName.Should().Be("Directory Verifier");
    }

    [Fact]
    public async Task Tier2_217_03_OtpReviewerSpecialActor_RendersPractitionerOtpConfirmation()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinicNorth = await ProvisionClinicAsync(cell, portal, "otp-actor-n", "Actor North");
        var clinicSouth = await ProvisionClinicAsync(cell, portal, "otp-actor-s", "Actor South");
        await SeedClinicOperationalSetupAsync(cell, clinicNorth, "DOH-LTO-AN");
        await SeedClinicOperationalSetupAsync(cell, clinicSouth, "DOH-LTO-AS");

        var docNorth = await CreateOptedInDoctorAsync(cell, clinicNorth, "Elena", "Reyes", "0099777", "elena.an@clinicez.ph");
        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new SubmitPractitionerVerificationCommand(docNorth.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        var northReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == docNorth.Id));
        await portal.SendAsync(new ApproveVerificationRequestCommand(northReq.Id, "admin_1", "Verifier One", "Approved"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var docSouth = await CreateOptedInDoctorAsync(cell, clinicSouth, "Elena", "Reyes", "99777", "elena.as@clinicez.ph");
        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new SubmitPractitionerVerificationCommand(docSouth.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var southReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == docSouth.Id));
        var email = portal.Notifications.Sent.Should().ContainSingle().Subject.Payload;
        var token = Uri.UnescapeDataString(email.Model["confirmUrl"].Split("token=", 2)[1]);
        var otpCode = email.Model["otpCode"];

        await portal.SendAsync(new ConfirmPractitionerAffiliationCommand(token, otpCode));

        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(southReq.Id));
        detail!.ReviewedByAdminUserId.Should().Be("practitioner-otp");
        detail.ReviewedByDisplayName.Should().Be("Practitioner (OTP Confirmation)");
        detail.SubmissionHistory.Should().ContainSingle().Which.ReviewedByDisplayName.Should().Be("Practitioner (OTP Confirmation)");
    }

    [Fact]
    public async Task Tier2_217_04_PartialSchemaAndLegacyJson_ExplicitFalseHonored_NoNullRef()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var tenantId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var facilityId = Guid.NewGuid();
        var partialReqId = Guid.NewGuid();
        var explicitFalseReqId = Guid.NewGuid();

        await portal.DbAsync(async db =>
        {
            db.Tenants.Add(new PortalTenant
            {
                Id = tenantId,
                TenantSlug = "partial-json",
                Name = "Partial JSON Workspace",
                OwnerId = "owner_pj",
                Email = "owner@pj.ph"
            });
            db.Branches.Add(new Branch
            {
                Id = branchId,
                TenantId = tenantId,
                Name = "Main Branch",
                IsPhilHealthAccredited = true,
                PhilHealthAccreditationNumber = "BR-PH-777"
            });
            db.Facilities.Add(new PortalFacility
            {
                Id = facilityId,
                TenantId = tenantId,
                BranchId = branchId,
                Name = "Partial Clinic",
                Slug = "partial-json",
                FacilityType = FacilityType.Clinic,
                Status = PortalFacilityStatus.Active
            });
            db.WorkspaceTeleconsultBillings.Add(new WorkspaceTeleconsultBilling
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                IsEnabled = true,
                BillingMode = WorkspaceTeleconsultBilling.ModePostpaid
            });
            db.FacilityVerificationRequests.Add(new FacilityVerificationRequest
            {
                Id = partialReqId,
                TenantId = tenantId,
                FacilityId = facilityId,
                SubmissionNumber = 1,
                CorrelationId = facilityId.ToString(),
                RequestKind = "Initial",
                SubmittedSnapshotJson = "{\"facilityName\":\"Legacy Clinic\"}",
                Status = "PendingReview"
            });
            db.FacilityVerificationRequests.Add(new FacilityVerificationRequest
            {
                Id = explicitFalseReqId,
                TenantId = tenantId,
                FacilityId = facilityId,
                SubmissionNumber = 2,
                CorrelationId = facilityId.ToString(),
                RequestKind = "Resubmission",
                SubmittedSnapshotJson = "{\"facilityName\":\"Explicit False Clinic\",\"isPhilHealthAccredited\":false,\"supportsInPerson\":false,\"supportsTeleconsult\":false}",
                Status = "PendingReview"
            });
            await db.SaveChangesAsync();
            return 0;
        });

        var partialDetail = await portal.SendAsync(new GetVerificationRequestDetailQuery(partialReqId));
        partialDetail.Should().NotBeNull();
        partialDetail!.IsPhilHealthAccredited.Should().BeTrue();
        partialDetail.SupportsInPerson.Should().BeTrue();
        partialDetail.SupportsTeleconsult.Should().BeTrue();

        var explicitFalseDetail = await portal.SendAsync(new GetVerificationRequestDetailQuery(explicitFalseReqId));
        explicitFalseDetail.Should().NotBeNull();
        explicitFalseDetail!.IsPhilHealthAccredited.Should().BeFalse();
        explicitFalseDetail.SupportsInPerson.Should().BeFalse();
        explicitFalseDetail.SupportsTeleconsult.Should().BeFalse();
    }

    [Fact]
    public async Task Tier2_217_05_ResubmissionDiff_AfterWithdrawnAndSuperseded_RetainsCascadeChildren()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "cascade-diff", "Cascade Diff Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);

        var docA = await CreateOptedInDoctorAsync(cell, clinic, "Alice", "Reyes", "0051111", "alice@cascade.ph");
        var docB = await CreateOptedInDoctorAsync(cell, clinic, "Bob", "Santos", "0052222", "bob@cascade.ph");
        var docRemoved = await CreateOptedInDoctorAsync(cell, clinic, "Removed", "Doctor", "0053333", "removed@cascade.ph");

        // Submit #1 with 3 bundled doctors, then remove docRemoved in place, then withdraw #1 (cascading Withdrawn to docA and docB)
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            docRemoved.Id, "Removed", "Doctor", null, "Dr.", StaffRole.Doctor, null, "removed@cascade.ph", null, "0053333",
            null, null, "General", true, IsDirectoryOptIn: false, SkipPendingVerificationSync: true));
        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand()));

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new WithdrawFacilityVerificationCommand("Replacing docB proof"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // Update docB PRC proof and add docC, then resubmit (#2)
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadStaffPrcProofCommand(
            docB.Id, "bob-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes));
        var docC = await CreateOptedInDoctorAsync(cell, clinic, "Clara", "Lim", "0054444", "clara@cascade.ph");

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var sub2 = await portal.DbAsync(db =>
            db.FacilityVerificationRequests.Where(r => r.FacilityId == clinic.Id).OrderBy(r => r.SubmissionNumber).LastAsync());
        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(sub2.Id));
        detail!.ResubmissionDiff.Should().NotBeNull();
        detail.ResubmissionDiff!.PreviousStatus.Should().Be("Withdrawn");

        var childB = detail.ChildPractitionerRequests.Single(c => c.ClinicStaffMemberId == docB.Id);
        var childC = detail.ChildPractitionerRequests.Single(c => c.ClinicStaffMemberId == docC.Id);

        detail.ResubmissionDiff.UpdatedChildPractitionerIds.Should().Contain(childB.Id);
        detail.ResubmissionDiff.UpdatedChildPractitionerIds.Should().Contain(childC.Id);
        detail.ResubmissionDiff.UpdatedChildPrcProofIds.Should().Contain(childB.Id);
        detail.ResubmissionDiff.UpdatedChildPrcProofIds.Should().Contain(childC.Id);

        // docA was unchanged between #1 and #2 -> must NOT be falsely flagged as Added
        detail.ResubmissionDiff.ChangedFields.Should().NotContain(f => f.ValueOrLabelContains("Alice Reyes") && f.ChangeKind == "Added");
        detail.ResubmissionDiff.ChangedFields.Should().Contain(f => f.ChangeKind == "Added" && f.CurrentValue != null && f.CurrentValue.Contains("Clara Lim"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 3 — Pairwise Cross-Feature Combinations (5 tests)
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Tier3_01_Metadata217SyncedInPlaceVia218_ReflectsImmediatelyInAdminDetail()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "pair-217-218", "Pairwise Metadata Sync Clinic", teleconsultEnabled: true);
        await SeedClinicOperationalSetupAsync(cell, clinic, dohLtoExpiryDate: null, teleconsultEntitled: true);
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061250", "ana@pair1.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        var req = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));

        var expiry = new DateOnly(2030, 1, 31);
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            LetterheadContact: "02-8555-0199",
            AccreditationNumber: "PH-999",
            EnableTeleconsultation: true,
            DohLtoExpiryDate: expiry,
            SkipPendingVerificationSync: true));
        await cell.Clinic.DbAsync(async db =>
        {
            var s = await db.Settings.IgnoreQueryFilters().FirstAsync(x => x.ClinicId == clinic.Id);
            s.IsPhilHealthConfigured = true;
            await db.SaveChangesAsync();
            return 0;
        });

        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand()));

        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(req.Id));
        detail!.Id.Should().Be(req.Id);
        detail.UpdatedAtUtc.Should().NotBeNull();
        detail.DohLtoExpiryDate.Should().Be(expiry);
        detail.ClinicContactNumber.Should().Be("02-8555-0199");
        detail.PhilHealthAccreditationNumber.Should().Be("PH-999");
        detail.IsPhilHealthAccredited.Should().BeTrue();
        detail.SupportsTeleconsult.Should().BeTrue();
    }

    [Fact]
    public async Task Tier3_02_InPlaceChildAdditionRemovalAndPrcProofReplacement_InBundledFacilitySync()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "pair-children", "Bundled Children Sync Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);

        var docA = await CreateOptedInDoctorAsync(cell, clinic, "Alice", "Reyes", "0055001", "alice@pair2.ph");
        var docB = await CreateOptedInDoctorAsync(cell, clinic, "Bob", "Santos", "0055002", "bob@pair2.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // Opt out docA, opt in docB, upload new PRC proof for docB, sync facility in place
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            docA.Id, "Alice", "Reyes", null, "Dr.", StaffRole.Doctor, null, "alice@pair2.ph", null, "0055001",
            null, null, "Internal Medicine", true, IsDirectoryOptIn: false, SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            docB.Id, "Bob", "Santos", null, "Dr.", StaffRole.Doctor, null, "bob@pair2.ph", null, "0055002",
            null, null, "Pediatrics", true, IsDirectoryOptIn: true, PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/bob-v1.pdf", VerificationContact: "bob@pair2.ph", SkipPendingVerificationSync: true));
        var bobProofV2 = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadStaffPrcProofCommand(
            docB.Id, "bob-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes, SkipPendingVerificationSync: true));

        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand()));

        var childA = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == docA.Id));
        childA.Status.Should().Be("Withdrawn");
        childA.WithdrawalReason.Should().Be("Removed from pending facility submission.");

        var childB = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == docB.Id));
        childB.Status.Should().Be("PendingReview");
        childB.PrcEvidenceObjectKey.Should().Be(bobProofV2.ObjectKey);

        // Now update docB specialty via practitioner pending update -> refreshes parent SubmittedSnapshotJson too
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            docB.Id, "Bob", "Santos", null, "Dr.", StaffRole.Doctor, null, "bob@pair2.ph", null, "0055002",
            null, null, "Neonatology", true, IsDirectoryOptIn: true, PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: bobProofV2.ObjectKey, VerificationContact: "bob@pair2.ph", SkipPendingVerificationSync: true));

        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingPractitionerVerificationCommand(docB.Id)));

        var facReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var snap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(facReq.SubmittedSnapshotJson);
        snap!.Practitioners.Should().ContainSingle(p => p.ClinicStaffMemberId == docB.Id && p.Specialty == "Neonatology");
    }

    [Fact]
    public async Task Tier3_03_ProofReplacementAfterRejection_WithInPlaceEdit_ComputesFullResubmissionDiff()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "pair-reject-diff", "Pairwise Reject Diff Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic, seedServicesCount: 10);
        var docA = await CreateOptedInDoctorAsync(cell, clinic, "Alice", "Reyes", "0056001", "alice@pair3.ph");

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var sub1 = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        await portal.SendAsync(new RejectVerificationRequestCommand(sub1.Id, "admin_1", "Verifier One", "Blurry LTO & PRC"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadLtoProofCommand(
            "lto-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadStaffPrcProofCommand(
            docA.Id, "prc-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicServiceItemCommand("SVC-11", "Service 11", "Lab", 400m));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicServiceItemCommand("SVC-12", "Service 12", "Lab", 500m));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(DohLtoExpiryDate: new DateOnly(2029, 9, 1)));

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // While #2 is PendingReview, edit OperatingHours in place via #218
        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            OperatingHours: "Mon-Sun 07:30-19:30")));

        var sub2 = await portal.DbAsync(db =>
            db.FacilityVerificationRequests.Where(r => r.FacilityId == clinic.Id).OrderBy(r => r.SubmissionNumber).LastAsync());
        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(sub2.Id));
        detail!.Snapshot!.Value.GetProperty("services").GetArrayLength().Should().Be(12);
        detail.ResubmissionDiff!.LtoProofUpdated.Should().BeTrue();
        detail.ResubmissionDiff.PrcProofUpdated.Should().BeTrue();
        detail.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "services" && c.CurrentValue!.Contains("12 service(s) (+2 added)"));
        detail.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "operatingHours");
        detail.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "dohLtoExpiryDate");
    }

    [Fact]
    public async Task Tier3_04_MultiClinicPractitioner_InPlaceUpdateToAwaitingOtp_ThenOtpConfirmReviewer()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinicNorth = await ProvisionClinicAsync(cell, portal, "pair-t34-n", "T34 North");
        var clinicSouth = await ProvisionClinicAsync(cell, portal, "pair-t34-s", "T34 South");
        await SeedClinicOperationalSetupAsync(cell, clinicNorth, "DOH-LTO-T34N");
        await SeedClinicOperationalSetupAsync(cell, clinicSouth, "DOH-LTO-T34S");

        var docNorth = await CreateOptedInDoctorAsync(cell, clinicNorth, "Elena", "Reyes", "0099887", "elena@t34n.ph");
        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new SubmitPractitionerVerificationCommand(docNorth.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        var northReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == docNorth.Id));
        await portal.SendAsync(new ApproveVerificationRequestCommand(northReq.Id, "admin_1", "Verifier One", "Approved"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // South initially submits wrong PRC "0099880" -> PendingReview
        var docSouth = await CreateOptedInDoctorAsync(cell, clinicSouth, "Elena", "Reyes", "0099880", "elena@t34s.ph");
        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new SubmitPractitionerVerificationCommand(docSouth.Id), docSouth.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var southReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == docSouth.Id));
        southReq.Status.Should().Be("PendingReview");

        // Fix PRC in place to "0099887" -> Portal transitions PendingReview -> AwaitingOtp on same RequestId
        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new UpdateStaffMemberCommand(
            docSouth.Id, "Elena", "Reyes", null, "Dr.", StaffRole.Doctor, null, "elena@t34s.ph", null, "0099887",
            null, null, "Cardiology", true, IsDirectoryOptIn: true, PrcExpiryDate: docSouth.PrcExpiryDate,
            VerificationContact: "elena@t34s.ph", SkipPendingVerificationSync: true), docSouth.Id);
        await PumpClinicCallAsync(cell, portal,
            cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new UpdatePendingPractitionerVerificationCommand(docSouth.Id), docSouth.Id));

        var transitionedReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.Id == southReq.Id));
        transitionedReq.Status.Should().Be("AwaitingOtp");

        var email = portal.Notifications.Sent.Should().ContainSingle().Subject.Payload;
        var token = Uri.UnescapeDataString(email.Model["confirmUrl"].Split("token=", 2)[1]);
        var confirmResult = await portal.SendAsync(new ConfirmPractitionerAffiliationCommand(token, email.Model["otpCode"]));
        confirmResult.AffiliationStatus.Should().Be("Active");

        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(southReq.Id));
        detail!.ReviewedByDisplayName.Should().Be("Practitioner (OTP Confirmation)");
        detail.SubmittedByDisplayName.Should().Be("Dr. Elena Reyes");
    }

    [Fact]
    public async Task Tier3_05_PortalInitiatedSettingsAndLtoUpdate_SyncsPendingRequestBeforeApproval_ThenLocks()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "pair-portal-sync", "Portal Sync Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic, "DOH-LTO-PS-1", "verification/lto/ps-v1.pdf");
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061260", "ana@pair5.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        var req = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));

        var portalExpiry = new DateOnly(2031, 3, 15);
        await portal.DbAsync(async db =>
        {
            using var scope = portal.Provider.CreateScope();
            var scopedDb = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
            var updater = scope.ServiceProvider.GetRequiredService<IDirectoryVerificationPendingUpdater>();
            var facility = await scopedDb.Facilities.Include(f => f.Tenant).FirstAsync(f => f.Id == clinic.Id);
            facility.LtoExpiryDate = portalExpiry;
            facility.LtoEvidenceObjectKey = "portal-uploads/lto-updated-by-portal.pdf";
            facility.ContactNumber = "+63288889999";

            var synced = await updater.SyncPendingFacilityFromPortalAsync(
                facility, facility.Tenant, "owner_pair", "Workspace Owner", "Owner", "facility-settings-updated");
            synced.Should().BeTrue();
            await scopedDb.SaveChangesAsync(CancellationToken.None);
            return 0;
        });

        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(req.Id));
        detail!.DohLtoExpiryDate.Should().Be(portalExpiry);
        detail.LtoEvidenceObjectKey.Should().Be("portal-uploads/lto-updated-by-portal.pdf");
        detail.UpdatedAtUtc.Should().NotBeNull();

        await portal.SendAsync(new ApproveVerificationRequestCommand(req.Id, "admin_1", "Verifier One", "Approved"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        Func<Task> postApprovalUpdate = () => cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand());
        (await postApprovalUpdate.Should().ThrowAsync<VerificationConflictException>())
            .Which.CurrentStatus.Should().Be("Verified");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 4 — Real-World End-to-End Application Scenarios (4 scenarios)
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Tier4_01_FullClinicLifecycle_Submit_InPlaceEnrich_Withdraw_Resubmit_Approve_PatientSearch()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "t4-ermita", "Manila Care Ermita", teleconsultEnabled: true);
        await SeedClinicOperationalSetupAsync(cell, clinic, "DOH-LTO-T4-1", "verification/lto/t4-v1.pdf", teleconsultEntitled: true, seedServicesCount: 14);

        var drRizal = await CreateOptedInDoctorAsync(cell, clinic, "Jose", "Rizal", "0071001", "rizal@ermita.ph", isOptedIn: true);
        var drMarco = await CreateOptedInDoctorAsync(cell, clinic, "Marco", "Polo", "0071002", "marco@ermita.ph", isOptedIn: false);
        await SeedWeeklyScheduleAsync(cell, clinic, drRizal.Id, "Dr. Jose Rizal", DayOfWeek.Monday, new TimeOnly(8, 0), new TimeOnly(17, 0));

        await portal.DbAsync(async db =>
        {
            db.AdminUsers.Add(new AdminUser
            {
                Id = Guid.NewGuid(),
                ClerkUserId = "verifier_t4",
                Email = "verifier@clinicez.ph",
                FullName = "Directory Verifier",
                RoleId = Guid.NewGuid()
            });
            await db.SaveChangesAsync();
            return 0;
        });

        // 1. Initial submit (#1)
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true), drRizal.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        var sub1 = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));

        // 2. Enrich while PendingReview via #218 in-place sync (DohLtoExpiryDate, Teleconsult, +2 services = 16, LTO & PRC proof)
        var expiry = new DateOnly(2030, 5, 1);
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            DohLtoExpiryDate: expiry,
            EnableTeleconsultation: true,
            AccreditationNumber: "PH-T4-001",
            SkipPendingVerificationSync: true), drRizal.Id);
        await cell.Clinic.DbAsync(async db =>
        {
            var s = await db.Settings.IgnoreQueryFilters().FirstAsync(x => x.ClinicId == clinic.Id);
            s.IsPhilHealthConfigured = true;
            await db.SaveChangesAsync();
            return 0;
        });
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicServiceItemCommand("SVC-15", "Service 15", "Lab", 400m, SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicServiceItemCommand("SVC-16", "Service 16", "Lab", 500m, SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadLtoProofCommand("t4-lto-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes, SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadStaffPrcProofCommand(drRizal.Id, "t4-prc-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes, SkipPendingVerificationSync: true));

        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand(), drRizal.Id));

        var detail1 = await portal.SendAsync(new GetVerificationRequestDetailQuery(sub1.Id));
        detail1!.Snapshot!.Value.GetProperty("services").GetArrayLength().Should().Be(16);
        detail1.DohLtoExpiryDate.Should().Be(expiry);
        detail1.SupportsTeleconsult.Should().BeTrue();
        detail1.IsPhilHealthAccredited.Should().BeTrue();
        detail1.SubmittedByDisplayName.Should().Be("Dr. Jose Rizal");
        (await portal.DbAsync(db => db.FacilityVerificationRequests.CountAsync(r => r.FacilityId == clinic.Id))).Should().Be(1);

        // 3. Withdraw #1, change LTO #, replace LTO proof, add 17th service, resubmit (#2)
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new WithdrawFacilityVerificationCommand("Updating LTO number"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(LetterheadDohLto: "DOH-LTO-T4-2"));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadLtoProofCommand("t4-lto-v3.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicServiceItemCommand("SVC-17", "Service 17", "Imaging", 1200m));

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true), drRizal.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var sub2 = await portal.DbAsync(db =>
            db.FacilityVerificationRequests.Where(r => r.FacilityId == clinic.Id).OrderBy(r => r.SubmissionNumber).LastAsync());
        var detail2 = await portal.SendAsync(new GetVerificationRequestDetailQuery(sub2.Id));
        detail2!.ResubmissionDiff!.PreviousStatus.Should().Be("Withdrawn");
        detail2.ResubmissionDiff.LtoProofUpdated.Should().BeTrue();
        detail2.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "dohLtoNumber");
        detail2.ResubmissionDiff.ChangedFields.Should().Contain(c => c.FieldKey == "services" && c.CurrentValue!.Contains("17 service(s)"));

        // 4. Approve #2 -> Patient search discovers clinic & Dr. Rizal (excluding Dr. Marco) -> post-approval 409 lock
        await portal.SendAsync(new ApproveVerificationRequestCommand(sub2.Id, "verifier_t4", "Directory Verifier", "Approved", AdminEmail: "verifier@clinicez.ph"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var search = await SearchDirectoryAsync(cell);
        search.Clinics.Should().ContainSingle(c => c.Id == clinic.Id && c.IsPlatformVerified);
        search.Doctors.Should().ContainSingle(d => d.Name.Contains("Jose Rizal") && d.IsVerified);
        search.Doctors.Should().NotContain(d => d.Name.Contains("Marco Polo"));

        Func<Task> postApprove = () => cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand());
        (await postApprove.Should().ThrowAsync<VerificationConflictException>()).Which.CurrentStatus.Should().Be("Verified");

        await AssertAllHubEnvelopesAreObjectKeyOnlyAndCompactAsync(cell.Hub);
        await cell.Clinic.AssertNothingStuckAsync();
        await cell.Patient.AssertNothingStuckAsync();
        await portal.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task Tier4_02_MultiClinicPractitioner_Reject_InPlaceResubmitSync_AwaitingOtp_OtpConfirm_PatientSearch()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinicNorth = await ProvisionClinicAsync(cell, portal, "t42-north", "T42 North");
        var clinicSouth = await ProvisionClinicAsync(cell, portal, "t42-south", "T42 South");
        await SeedClinicOperationalSetupAsync(cell, clinicNorth, "DOH-LTO-42N");
        await SeedClinicOperationalSetupAsync(cell, clinicSouth, "DOH-LTO-42S");

        foreach (var c in new[] { clinicNorth, clinicSouth })
        {
            await CreateOptedInDoctorAsync(cell, c, "Arthur", "Director", $"001{c.Id.ToString("N")[..4]}", $"dir@{c.Id:N}.ph", isOptedIn: false);
            await cell.Clinic.SendAsync(c.Tenant, c.Id, new PublishClinicToDirectoryCommand(true));
        }
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        foreach (var r in await portal.DbAsync(db => db.FacilityVerificationRequests.ToListAsync()))
        {
            await portal.SendAsync(new ApproveVerificationRequestCommand(r.Id, "admin_1", "Verifier One", "Approved"));
        }
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // 1. North submits Dr. Elena Reyes -> Rejected -> Resubmit -> In-Place Edit Specialty -> Approved
        var elenaNorth = await CreateOptedInDoctorAsync(cell, clinicNorth, "Elena", "Reyes", "0099887", "elena.n@t42.ph");
        await SeedWeeklyScheduleAsync(cell, clinicNorth, elenaNorth.Id, "Dr. Elena Reyes", DayOfWeek.Monday, new TimeOnly(9, 0), new TimeOnly(17, 0));

        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new SubmitPractitionerVerificationCommand(elenaNorth.Id), elenaNorth.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        var northSub1 = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == elenaNorth.Id));
        await portal.SendAsync(new RejectVerificationRequestCommand(northSub1.Id, "admin_1", "Verifier One", "PRC image blurry"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new UploadStaffPrcProofCommand(
            elenaNorth.Id, "elena-clear.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes));
        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new SubmitPractitionerVerificationCommand(elenaNorth.Id), elenaNorth.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // In-place specialty edit on #2
        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new UpdateStaffMemberCommand(
            elenaNorth.Id, "Elena", "Reyes", null, "Dr.", StaffRole.Doctor, null, "elena.n@t42.ph", null, "0099887",
            null, null, "Interventional Cardiology", true, IsDirectoryOptIn: true, PrcExpiryDate: elenaNorth.PrcExpiryDate,
            VerificationContact: "elena.n@t42.ph", SkipPendingVerificationSync: true), elenaNorth.Id);
        await PumpClinicCallAsync(cell, portal,
            cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new UpdatePendingPractitionerVerificationCommand(elenaNorth.Id), elenaNorth.Id));

        var northSub2 = await portal.DbAsync(db =>
            db.PractitionerVerificationRequests.Where(r => r.ClinicStaffMemberId == elenaNorth.Id).OrderBy(r => r.SubmissionNumber).LastAsync());
        var northDetail2 = await portal.SendAsync(new GetVerificationRequestDetailQuery(northSub2.Id));
        northDetail2!.ResubmissionDiff!.PreviousStatus.Should().Be("Rejected");
        northDetail2.ResubmissionDiff.PrcProofUpdated.Should().BeTrue();
        northDetail2.ChildPractitionerRequests.Single().Specialty.Should().Be("Interventional Cardiology");

        await portal.SendAsync(new ApproveVerificationRequestCommand(northSub2.Id, "admin_1", "Verifier One", "Verified"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // 2. South submits Dr. Elena Reyes -> AwaitingOtp -> in-place bio edit (0 extra emails) -> OTP Confirm -> Patient search groups 2 clinics
        var elenaSouth = await CreateOptedInDoctorAsync(cell, clinicSouth, "Elena", "Reyes", "99887", "elena.s@t42.ph");
        await SeedWeeklyScheduleAsync(cell, clinicSouth, elenaSouth.Id, "Dr. Elena Reyes", DayOfWeek.Wednesday, new TimeOnly(10, 0), new TimeOnly(15, 0));
        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new SubmitPractitionerVerificationCommand(elenaSouth.Id), elenaSouth.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var southReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == elenaSouth.Id));
        southReq.Status.Should().Be("AwaitingOtp");
        var otpHashBefore = southReq.OtpTokenHash;

        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new UpdateStaffMemberCommand(
            elenaSouth.Id, "Elena", "Reyes", null, "Dr.", StaffRole.Doctor, null, "elena.s@t42.ph", null, "99887",
            null, null, "Internal Medicine", true, IsDirectoryOptIn: true, PrcExpiryDate: elenaSouth.PrcExpiryDate,
            VerificationContact: "elena.s@t42.ph", PublicBio: "Refined South bio", SkipPendingVerificationSync: true), elenaSouth.Id);
        await PumpClinicCallAsync(cell, portal,
            cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new UpdatePendingPractitionerVerificationCommand(elenaSouth.Id), elenaSouth.Id));

        portal.Notifications.Sent.Should().HaveCount(1);
        (await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.Id == southReq.Id))).OtpTokenHash.Should().Be(otpHashBefore);

        var email = portal.Notifications.Sent[0].Payload;
        var token = Uri.UnescapeDataString(email.Model["confirmUrl"].Split("token=", 2)[1]);
        await portal.SendAsync(new ConfirmPractitionerAffiliationCommand(token, email.Model["otpCode"]));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var southDetail = await portal.SendAsync(new GetVerificationRequestDetailQuery(southReq.Id));
        southDetail!.ReviewedByDisplayName.Should().Be("Practitioner (OTP Confirmation)");
        southDetail.SubmittedByDisplayName.Should().Be("Dr. Elena Reyes");

        var search = await SearchDirectoryAsync(cell, "Elena Reyes", "doctors");
        var grouped = search.Doctors.Should().ContainSingle().Subject;
        grouped.Affiliations!.Should().HaveCount(2);
        grouped.Affiliations.Select(a => a.ClinicId).Should().BeEquivalentTo([clinicNorth.Id, clinicSouth.Id]);

        await cell.Clinic.AssertNothingStuckAsync();
        await cell.Patient.AssertNothingStuckAsync();
        await portal.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task Tier4_03_OfflineWorkstation_AutoSaveIsolation_Explicit503_ImplicitOutboxDrain()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "t43-offline", "Offline Workstation Clinic");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        var doc = await CreateOptedInDoctorAsync(cell, clinic, "Carlo", "Mendoza", "0054400", "carlo@t43.ph", isOptedIn: false);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        var submittedDoc = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new SubmitPractitionerVerificationCommand(doc.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var outboxBeforeAutoSave = (await cell.Clinic.OutboxAsync()).Count;

        // 1. PreferencesJson auto-save -> 0 Interop calls
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateMyProfileCommand(
            submittedDoc.Id, submittedDoc.FirstName, submittedDoc.LastName, submittedDoc.MiddleName, submittedDoc.Title,
            submittedDoc.PhoneNumber, submittedDoc.PrcLicenseNumber, submittedDoc.PtrNumber, submittedDoc.S2LicenseNumber,
            submittedDoc.Specialty, submittedDoc.PhilHealthPan,
            PreferencesJson: "{\"compact\":true}", IsDirectoryOptIn: submittedDoc.IsDirectoryOptIn,
            PrcExpiryDate: submittedDoc.PrcExpiryDate, PrcEvidenceObjectKey: submittedDoc.PrcEvidenceObjectKey,
            VerificationContact: submittedDoc.VerificationContact, PublicBio: submittedDoc.PublicBio), submittedDoc.Id);
        (await cell.Clinic.OutboxAsync()).Should().HaveCount(outboxBeforeAutoSave);

        // 2. Implicit staff edit while Portal is offline -> commits locally and queues PractitionerVerificationUpdateRequested outbox
        var implicitCall = cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            doc.Id, "Carlo", "Mendoza", null, "Dr.", StaffRole.Doctor, null, "carlo@t43.ph", null, "0054400",
            null, null, "Geriatrics", true, IsDirectoryOptIn: true, PrcExpiryDate: doc.PrcExpiryDate,
            VerificationContact: "carlo@t43.ph", PublicBio: "Geriatrics specialist", SkipPendingVerificationSync: false));
        await Cell.PumpUntilAsync([cell.Clinic], implicitCall, TimeSpan.FromSeconds(25));

        (await cell.Clinic.OutboxAsync()).Should().Contain(o => o.Type == InteropTypes.PractitionerVerificationUpdateRequested);

        // 3. Portal comes back online -> drains queued update in place
        await Cell.PumpAsync([cell.Clinic, portal, cell.Patient]);

        var pracReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.ClinicStaffMemberId == doc.Id));
        var pracDetail = await portal.SendAsync(new GetVerificationRequestDetailQuery(pracReq.Id));
        pracDetail!.ChildPractitionerRequests.Single().Specialty.Should().Be("Geriatrics");

        await cell.Clinic.AssertNothingStuckAsync();
        await portal.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task Tier4_05_BundledFacilityWith20ServicesAnd3Practitioners_Enrichment_Diff_AndApprovalImmutability()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "t45-bundled", "Mega Bundled Clinic", teleconsultEnabled: true);
        await SeedClinicOperationalSetupAsync(cell, clinic, "DOH-LTO-MEGA-1", "verification/lto/mega-v1.pdf",
            dohLtoExpiryDate: new DateOnly(2028, 12, 31), teleconsultEntitled: true, seedServicesCount: 20);

        var doc1 = await CreateOptedInDoctorAsync(cell, clinic, "One", "Doctor", "0040001", "one@mega.ph");
        var doc2 = await CreateOptedInDoctorAsync(cell, clinic, "Two", "Doctor", "0040002", "two@mega.ph");
        var doc3 = await CreateOptedInDoctorAsync(cell, clinic, "Three", "Doctor", "0040003", "three@mega.ph");

        // Submit #1 with 20 services and 3 bundled practitioners
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true), doc1.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var sub1 = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var sub1Detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(sub1.Id));
        sub1Detail!.Snapshot!.Value.GetProperty("services").GetArrayLength().Should().Be(20);
        sub1Detail.ChildPractitionerRequests.Should().HaveCount(3);

        // Enrich in place (#218): opt out doc3, update doc2 bio, update LTO expiry
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            doc3.Id, "Three", "Doctor", null, "Dr.", StaffRole.Doctor, null, "three@mega.ph", null, "0040003",
            null, null, "Internal Medicine", true, IsDirectoryOptIn: false, SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateStaffMemberCommand(
            doc2.Id, "Two", "Doctor", null, "Dr.", StaffRole.Doctor, null, "two@mega.ph", null, "0040002",
            null, null, "Endocrinology", true, IsDirectoryOptIn: true, PrcExpiryDate: doc2.PrcExpiryDate,
            VerificationContact: "two@mega.ph", PublicBio: "Updated doc2 bio", SkipPendingVerificationSync: true));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(
            DohLtoExpiryDate: new DateOnly(2030, 12, 31), SkipPendingVerificationSync: true));

        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand(), doc1.Id));

        // Reject #1 -> replace LTO proof -> resubmit #2 -> Approve -> confirm 409 lock
        await portal.SendAsync(new RejectVerificationRequestCommand(sub1.Id, "admin_1", "Verifier One", "Need clearer LTO"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UploadLtoProofCommand("mega-v2.pdf", "application/pdf", SamplePdfBytes.Length, SamplePdfBytes));
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true), doc1.Id);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var sub2 = await portal.DbAsync(db =>
            db.FacilityVerificationRequests.Where(r => r.FacilityId == clinic.Id).OrderBy(r => r.SubmissionNumber).LastAsync());
        var sub2Detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(sub2.Id));
        sub2Detail!.ResubmissionDiff!.LtoProofUpdated.Should().BeTrue();
        sub2Detail.ChildPractitionerRequests.Should().HaveCount(2);

        await portal.SendAsync(new ApproveVerificationRequestCommand(sub2.Id, "admin_1", "Verifier One", "Approved"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        Func<Task> locked = () => cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand());
        (await locked.Should().ThrowAsync<VerificationConflictException>()).Which.CurrentStatus.Should().Be("Verified");

        await AssertAllHubEnvelopesAreObjectKeyOnlyAndCompactAsync(cell.Hub);
        await cell.Clinic.AssertNothingStuckAsync();
        await cell.Patient.AssertNothingStuckAsync();
        await portal.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task Tier2_217_07_PhilHealthOverrideNotAccredited_DoesNotLeakPortalBranchAccreditationNumber()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationSyncHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "phic-override-iso", "Override Isolation Clinic",
            branchPhilHealthAccredited: true, branchPhilHealthNumber: "BR-PHIC-999");
        await SeedClinicOperationalSetupAsync(cell, clinic);
        await CreateOptedInDoctorAsync(cell, clinic, "Ana", "Cruz", "0061277", "ana@phiciso.ph", isOptedIn: false);

        // Simulate Portal Facility initially inheriting Branch PhilHealth accreditation
        await portal.DbAsync(async db =>
        {
            var fac = await db.Facilities.FirstAsync(f => f.Id == clinic.Id);
            fac.PhilHealthAccreditationNumber = "BR-PHIC-999";
            await db.SaveChangesAsync();
            return 0;
        });

        // Clinic overrides PhilHealth locally to Not Accredited (AccreditationNumber = null, IsPhilHealthConfigured = false)
        await cell.Clinic.DbAsync(async db =>
        {
            var s = await db.Settings.IgnoreQueryFilters().FirstAsync(x => x.ClinicId == clinic.Id);
            s.IsPhilHealthOverridden = true;
            s.IsBranchPhilHealthAccredited = true;
            s.BranchPhilHealthAccreditationNumber = "BR-PHIC-999";
            s.AccreditationNumber = null;
            s.IsPhilHealthConfigured = false;
            await db.SaveChangesAsync();
            return 0;
        });

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var facReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var detail = await portal.SendAsync(new GetVerificationRequestDetailQuery(facReq.Id));
        detail.Should().NotBeNull();
        detail!.IsPhilHealthAccredited.Should().BeFalse();
        detail.PhilHealthAccreditationNumber.Should().BeNull("explicitly non-accredited clinic override must not leak Portal Branch.PhilHealthAccreditationNumber");

        // In-place sync preserves override isolation
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdateClinicSettingsCommand(OperatingHours: "Mon-Fri 08:00-18:00", SkipPendingVerificationSync: true));
        await PumpClinicCallAsync(cell, portal, cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new UpdatePendingFacilityVerificationCommand()));

        var detailAfterSync = await portal.SendAsync(new GetVerificationRequestDetailQuery(facReq.Id));
        detailAfterSync!.IsPhilHealthAccredited.Should().BeFalse();
        detailAfterSync.PhilHealthAccreditationNumber.Should().BeNull();

        await portal.SendAsync(new ApproveVerificationRequestCommand(facReq.Id, "admin_1", "Verifier One", "Approved"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);
        var approvedFacility = await portal.DbAsync(db => db.Facilities.SingleAsync(f => f.Id == clinic.Id));
        approvedFacility.PhilHealthAccreditationNumber.Should().BeNull();

        await cell.Clinic.AssertNothingStuckAsync();
        await portal.AssertNothingStuckAsync();
    }
}

internal static class FieldChangeAssertionsExtensions
{
    public static bool ValueOrLabelContains(this FieldChangeDto change, string token) =>
        (change.Label?.Contains(token, StringComparison.OrdinalIgnoreCase) ?? false)
        || (change.PreviousValue?.Contains(token, StringComparison.OrdinalIgnoreCase) ?? false)
        || (change.CurrentValue?.Contains(token, StringComparison.OrdinalIgnoreCase) ?? false);
}
