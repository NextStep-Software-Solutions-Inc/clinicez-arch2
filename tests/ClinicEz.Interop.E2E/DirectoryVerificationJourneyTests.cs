using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.CreateBookingDraft;
using ClinicEz.Patient.Infrastructure.Services.Search;
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
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using MediatR;
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
/// End-to-end verification journeys across real signed Interop Hub envelopes
/// (<see cref="ClinicHost"/> &lt;-&gt; <see cref="HubFixture"/> &lt;-&gt; <see cref="PortalVerificationHost"/> &lt;-&gt; <see cref="PatientHost"/>)
/// and <see cref="DirectoryCatalogSearchService"/>.
/// </summary>
public sealed class DirectoryVerificationJourneyTests
{
    private const int MaxEnvelopeBytes = 8 * 1024 * 1024;

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

    private sealed class PortalVerificationHost : ServiceHostBase
    {
        public RecordingNotificationService Notifications { get; } = new();

        public PortalVerificationHost(HubFixture hub) : base(InteropServices.Portal)
        {
            var settings = BaseConfig(InteropServices.Portal, "public");
            var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
            var dbName = $"e2e-portal-dir-{Guid.NewGuid():N}";

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
            services.AddApplicationServices();
            services.AddInterop<PortalDbContext>(config, handlers => handlers
                .Handle<FacilityProvisionedEvent, FacilityProvisionedHandler>(InteropTypes.FacilityProvisioned)
                .Handle<FacilityVerificationRequestedPayload, FacilityVerificationRequestedHandler>(InteropTypes.FacilityVerificationRequested)
                .Handle<FacilityVerificationWithdrawnPayload, FacilityVerificationWithdrawnHandler>(InteropTypes.FacilityVerificationWithdrawn)
                .Handle<PractitionerVerificationRequestedPayload, PractitionerVerificationRequestedHandler>(InteropTypes.PractitionerVerificationRequested));
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

    private static async Task<Fac> ProvisionClinicAsync(
        TestCell cell,
        PortalVerificationHost portal,
        string tenantSlug,
        string facilityName,
        bool isPatientDiscoveryEligible)
    {
        var tenantId = Guid.NewGuid();
        var fac = Fac.Clinic(tenantId.ToString(), facilityName);

        await portal.DbAsync(async db =>
        {
            var tenant = new PortalTenant
            {
                Id = tenantId,
                TenantSlug = tenantSlug,
                Name = $"{facilityName} Workspace",
                OwnerId = $"owner_{tenantSlug}",
                Email = $"owner@{tenantSlug}.ph",
                City = "Manila",
                Province = "Metro Manila"
            };
            var facility = new PortalFacility
            {
                Id = fac.Id,
                TenantId = tenantId,
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
            db.Facilities.Add(facility);
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
        string dohLtoNumber,
        string? ltoEvidenceObjectKey = "verification/lto/clinic-lto.pdf")
    {
        var licenseToken = new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = clinic.Id,
            TenantId = clinic.Tenant,
            FacilityName = clinic.Name,
            FacilityType = nameof(FacilityType.Clinic),
            PlanTier = "Pro",
            Limits = new FacilityLimits { MaxStaff = 25 },
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        });

        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == clinic.Id);
            settings.LicenseToken = licenseToken;
            settings.MaxStaffLimit = 25;
            settings.OperatingHours = "Mon-Sat 08:00-17:00";
            settings.LetterheadAddress = $"100 {clinic.Name} Ave, Manila";
            settings.LetterheadContact = "0917-555-0100";
            settings.LetterheadDohLto = dohLtoNumber;
            settings.LtoEvidenceObjectKey = ltoEvidenceObjectKey;

            db.ServiceItems.Add(new ServiceItem
            {
                Id = Guid.NewGuid(),
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                Code = $"CON-{clinic.Id.ToString("N")[..4]}",
                Name = "General Consultation",
                Category = "Consultation",
                StandardPrice = 600m,
                IsActive = true
            });

            await db.SaveChangesAsync();
            return 0;
        });
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

    private static Task<ClinicEz.Patient.Application.Common.DTOs.PractitionerProfileDto?> GetPractitionerProfileAsync(
        TestCell cell,
        Guid id) =>
        cell.Patient.DbAsync(db =>
            new DirectoryCatalogSearchService(db, TimeProvider.System)
                .GetPractitionerProfileAsync(id, patientId: null));

    private static async Task AssertAllHubEnvelopesAreObjectKeyOnlyAndCompactAsync(HubFixture hub)
    {
        new HubOptions().MaxEnvelopeBytes.Should().Be(MaxEnvelopeBytes);

        var messages = await hub.DbAsync(db => db.Messages.AsNoTracking().ToListAsync());
        messages.Should().NotBeEmpty();

        foreach (var msg in messages)
        {
            var byteCount = Encoding.UTF8.GetByteCount(msg.Envelope);
            byteCount.Should().BeLessThan(MaxEnvelopeBytes, $"envelope {msg.Type} must remain far under Hub:MaxEnvelopeBytes (8 MiB)");
            byteCount.Should().BeLessThan(64 * 1024, $"object-key-only envelope {msg.Type} should stay lightweight");
            msg.Envelope.Should().NotContain("data:image/", "raw base64 images must never travel inside Hub envelopes");
            msg.Envelope.Should().NotContain("%PDF-", "raw PDF bytes must never travel inside Hub envelopes");
        }
    }

    [Fact]
    public async Task FunctionalCheck1_UnlistedClinicIsolation_OperatesLocallyAndStaysAbsentFromPublicDirectorySearch()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "unlisted-care", "Unlisted Local Clinic", isPatientDiscoveryEligible: false);
        await SeedClinicOperationalSetupAsync(cell, clinic, "DOH-LTO-UNLISTED-01", ltoEvidenceObjectKey: null);

        // Local doctor with IsDirectoryOptIn = false and a local receptionist operate without directory exposure.
        var localDoctor = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateStaffMemberCommand(
            FirstName: "Marco",
            LastName: "Villanueva",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "marco.local@unlisted.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "0044112",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Family Medicine",
            InitialPassword: "ClinicPass2026!",
            IsDirectoryOptIn: false));

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateStaffMemberCommand(
            FirstName: "Bea",
            LastName: "Ramos",
            MiddleName: null,
            Title: null,
            Role: StaffRole.Receptionist,
            ClinicRoleId: null,
            Email: "bea.desk@unlisted.ph",
            PhoneNumber: null,
            PrcLicenseNumber: null,
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: null,
            InitialPassword: "ClinicPass2026!",
            IsDirectoryOptIn: false));

        // Clinic operates locally (local patient + encounter) while remaining unlisted.
        var localPatient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, syncPatientId: null, first: "Local", last: "Patient");
        var staffEntity = await cell.Clinic.DbAsync(db => db.StaffMembers.IgnoreQueryFilters().FirstAsync(s => s.Id == localDoctor.Id));
        var encounter = await ClinicSeed.EncounterWithPrescriptionAsync(cell.Clinic, clinic, localPatient, staffEntity);
        encounter.ClinicId.Should().Be(clinic.Id);

        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var patientClinic = await cell.Patient.DbAsync(db => db.Clinics.AsNoTracking().FirstOrDefaultAsync(c => c.Id == clinic.Id));
        if (patientClinic is not null)
        {
            patientClinic.IsPublic.Should().BeFalse();
            patientClinic.IsWorkspaceEligible.Should().BeFalse();
            patientClinic.IsPlatformVerified.Should().BeFalse();
        }

        var search = await SearchDirectoryAsync(cell);
        search.Clinics.Should().NotContain(c => c.Id == clinic.Id);
        search.Doctors.Should().NotContain(d => d.ClinicId == clinic.Id || d.Name.Contains("Villanueva"));
        search.Services.Should().NotContain(s => s.ClinicId == clinic.Id);

        // Even if the clinic later enables discovery & becomes verified, IsDirectoryOptIn = false staff and Receptionist stay unlisted.
        await portal.StageWorkspaceEligibilityAsync(clinic.Id, true);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var submitRes = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        submitRes.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.PendingReview);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var pendingReq = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        var snapshot = DirectoryVerificationHelper.DeserializeFacilitySnapshot(pendingReq.SubmittedSnapshotJson);
        snapshot.Should().NotBeNull();
        snapshot!.Practitioners.Should().BeEmpty("IsDirectoryOptIn = false doctors and Receptionists must never be bundled");

        await portal.SendAsync(new ApproveVerificationRequestCommand(pendingReq.Id, "admin_1", "Verifier One", "Approved clinic only"));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var afterApprovalSearch = await SearchDirectoryAsync(cell);
        afterApprovalSearch.Clinics.Should().Contain(c => c.Id == clinic.Id && c.IsPlatformVerified);
        afterApprovalSearch.Doctors.Should().BeEmpty("non-opted-in doctors and receptionists must remain absent from public search");

        await AssertAllHubEnvelopesAreObjectKeyOnlyAndCompactAsync(cell.Hub);
        await cell.Clinic.AssertNothingStuckAsync();
        await cell.Patient.AssertNothingStuckAsync();
        await portal.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task FunctionalCheck2_FacilityLifecycle_Submit_Withdraw_Reject_Resubmit_OfflineBuffer_Approve_AndBookingPause()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationHost(cell.Hub);

        var clinic = await ProvisionClinicAsync(cell, portal, "manila-prime", "Manila Prime Medical Clinic", isPatientDiscoveryEligible: true);
        await SeedClinicOperationalSetupAsync(cell, clinic, "DOH-LTO-2026-881", "verification/lto/manila-prime-v1.pdf");

        var optedInDoctor = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateStaffMemberCommand(
            FirstName: "Rafael",
            LastName: "Mendoza",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "rafael@manilaprime.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "0071234",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Internal Medicine",
            InitialPassword: "ClinicPass2026!",
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/rafael-v1.pdf",
            VerificationContact: "rafael@manilaprime.ph",
            PublicBio: "Internal medicine specialist."));

        await SeedWeeklyScheduleAsync(cell, clinic, optedInDoctor.Id, "Dr. Rafael Mendoza", DayOfWeek.Monday, new TimeOnly(9, 0), new TimeOnly(17, 0));

        // 1. Clinic submits facility verification -> PendingReview, IsPublic remains false
        var submit1 = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        submit1.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.PendingReview);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var portalReq1 = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.FacilityId == clinic.Id));
        portalReq1.SubmissionNumber.Should().Be(1);
        portalReq1.Status.Should().Be("PendingReview");
        portalReq1.LtoEvidenceObjectKey.Should().Be("verification/lto/manila-prime-v1.pdf");

        var patientBeforeApprove = await cell.Patient.DbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinic.Id));
        patientBeforeApprove.IsPublic.Should().BeFalse();
        (await SearchDirectoryAsync(cell)).Clinics.Should().NotContain(c => c.Id == clinic.Id);

        // 2. Clinic withdraws submission -> FacilityVerificationRequest.Status == "Withdrawn" (row preserved)
        var withdrawResult = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new WithdrawFacilityVerificationCommand("Replacing LTO scan"));
        withdrawResult.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.Unverified);
        withdrawResult.IsPublished.Should().BeFalse();
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var portalReq1AfterWithdraw = await portal.DbAsync(db => db.FacilityVerificationRequests.SingleAsync(r => r.Id == portalReq1.Id));
        portalReq1AfterWithdraw.Status.Should().Be("Withdrawn");
        portalReq1AfterWithdraw.WithdrawalReason.Should().Be("Replacing LTO scan");
        portalReq1AfterWithdraw.WithdrawnAtUtc.Should().NotBeNull();

        // 3. Clinic resubmits -> second FacilityVerificationRequest row + WorkspaceAuditEntry logged
        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == clinic.Id);
            settings.LtoEvidenceObjectKey = "verification/lto/manila-prime-v2.pdf";
            await db.SaveChangesAsync();
            return 0;
        });

        var submit2 = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        submit2.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.PendingReview);
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var portalRequestsAfterResubmit = await portal.DbAsync(db =>
            db.FacilityVerificationRequests.Where(r => r.FacilityId == clinic.Id).OrderBy(r => r.SubmissionNumber).ToListAsync());
        portalRequestsAfterResubmit.Should().HaveCount(2);
        portalRequestsAfterResubmit[0].Status.Should().Be("Withdrawn");
        portalRequestsAfterResubmit[1].SubmissionNumber.Should().Be(2);
        portalRequestsAfterResubmit[1].Status.Should().Be("PendingReview");
        portalRequestsAfterResubmit[1].LtoEvidenceObjectKey.Should().Be("verification/lto/manila-prime-v2.pdf");

        var portalAuditActions = await portal.DbAsync(db =>
            db.WorkspaceAuditEntries
                .Where(a => a.TenantId == Guid.Parse(clinic.Tenant) && a.Section == DirectoryVerificationHelper.AuditSection)
                .Select(a => a.Action)
                .ToListAsync());
        portalAuditActions.Should().Contain("facility-submitted");
        portalAuditActions.Should().Contain("facility-withdrawn");

        // 4. Portal rejects submission #2 -> Clinic receives facility.verification.rejected with reason
        await portal.SendAsync(new RejectVerificationRequestCommand(
            portalRequestsAfterResubmit[1].Id,
            "admin_1",
            "Verifier One",
            "DOH LTO seal is unreadable."));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var clinicSettingsAfterReject = await cell.Clinic.DbAsync(db => db.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == clinic.Id));
        clinicSettingsAfterReject.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.Rejected);
        clinicSettingsAfterReject.VerificationRejectionReason.Should().Be("DOH LTO seal is unreadable.");
        clinicSettingsAfterReject.IsDirectoryPublished.Should().BeFalse();
        (await SearchDirectoryAsync(cell)).Clinics.Should().NotContain(c => c.Id == clinic.Id);

        // 5. Clinic resubmits (#3) and Portal approves while patient-api is OFFLINE (buffered in cloud:patient mailbox)
        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == clinic.Id);
            settings.LtoEvidenceObjectKey = "verification/lto/manila-prime-v3.pdf";
            await db.SaveChangesAsync();
            return 0;
        });

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var portalReq3 = await portal.DbAsync(db =>
            db.FacilityVerificationRequests.Where(r => r.FacilityId == clinic.Id).OrderBy(r => r.SubmissionNumber).LastAsync());
        portalReq3.SubmissionNumber.Should().Be(3);
        portalReq3.RequestKind.Should().Be("Resubmission");

        var approval = await portal.SendAsync(new ApproveVerificationRequestCommand(
            portalReq3.Id,
            "admin_1",
            "Verifier One",
            "Verified LTO v3 and PRC credentials."));
        approval.ApprovedPractitionerIds.Should().ContainSingle();
        var canonicalDoctorId = approval.ApprovedPractitionerIds[0];

        // Pump ONLY Portal and Clinic so patient-api stays offline and Hub buffers cloud:patient messages.
        await Cell.PumpAsync([portal, cell.Clinic]);

        var bufferedForPatient = await cell.Hub.DbAsync(db =>
            db.Messages
                .AsNoTracking()
                .Where(m => m.Mailbox == $"cloud:{InteropServices.Patient}" && m.AckedAtUtc == null)
                .Select(m => m.Type)
                .ToListAsync());
        bufferedForPatient.Should().Contain(InteropTypes.FacilityDirectoryUpdated);
        bufferedForPatient.Should().Contain(InteropTypes.PractitionerIdentityUpdated);

        var clinicSettingsAfterApprove = await cell.Clinic.DbAsync(db => db.Settings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == clinic.Id));
        clinicSettingsAfterApprove.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.Verified);
        var clinicStaffAfterApprove = await cell.Clinic.DbAsync(db => db.StaffMembers.IgnoreQueryFilters().FirstAsync(s => s.Id == optedInDoctor.Id));
        clinicStaffAfterApprove.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Verified);
        clinicStaffAfterApprove.CanonicalProviderId.Should().Be(canonicalDoctorId);

        // Bring patient-api back online and pump -> buffered approvals drain and clinic/doctor become searchable!
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var remainingUnacked = await cell.Hub.DbAsync(db =>
            db.Messages.AsNoTracking().CountAsync(m => m.Mailbox == $"cloud:{InteropServices.Patient}" && m.AckedAtUtc == null));
        remainingUnacked.Should().Be(0);

        var patientClinicAfterApprove = await cell.Patient.DbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinic.Id));
        patientClinicAfterApprove.IsPublic.Should().BeTrue();
        patientClinicAfterApprove.IsPlatformVerified.Should().BeTrue();
        patientClinicAfterApprove.SupportsAppointments.Should().BeTrue();

        var searchAfterApprove = await SearchDirectoryAsync(cell);
        searchAfterApprove.Clinics.Should().ContainSingle(c => c.Id == clinic.Id && c.IsPublic && c.SupportsAppointments && c.IsPlatformVerified);
        searchAfterApprove.Doctors.Should().ContainSingle(d => d.PractitionerId == canonicalDoctorId && d.IsVerified);

        // 6. Booking pause keeps verified clinic in search with SupportsAppointments = false and blocks booking (409 ConflictException)
        var pauseResult = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new ToggleOnlineBookingPauseCommand(true));
        pauseResult.IsPaused.Should().BeTrue();
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var searchWhilePaused = await SearchDirectoryAsync(cell);
        var pausedClinicDto = searchWhilePaused.Clinics.Should().ContainSingle(c => c.Id == clinic.Id).Subject;
        pausedClinicDto.SupportsAppointments.Should().BeFalse();
        pausedClinicDto.IsPublic.Should().BeTrue();
        pausedClinicDto.Tags.Should().Contain("Booking Paused");

        var patientId = await PatientSeed.AccountAsync(cell.Patient);
        Func<Task> bookWhilePaused = () => cell.Patient.SendAsync(new CreateBookingDraftCommand(
            PatientId: patientId,
            ClinicId: clinic.Id,
            OrganizationId: null,
            PreferredDate: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            PreferredTime: "10:00",
            Reason: "Routine checkup",
            Notes: null,
            ShareFieldsJson: "[\"demographics\"]",
            AttachedFileIdsJson: "[]",
            ProviderId: optedInDoctor.Id,
            ProviderName: "Dr. Rafael Mendoza"));

        await bookWhilePaused.Should().ThrowAsync<ConflictException>()
            .WithMessage("*paused*");

        // Resuming online booking restores SupportsAppointments = true and unblocks CreateBookingDraftCommand
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new ToggleOnlineBookingPauseCommand(false));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var draftId = await cell.Patient.SendAsync(new CreateBookingDraftCommand(
            PatientId: patientId,
            ClinicId: clinic.Id,
            OrganizationId: null,
            PreferredDate: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            PreferredTime: "10:00",
            Reason: "Routine checkup",
            Notes: null,
            ShareFieldsJson: "[\"demographics\"]",
            AttachedFileIdsJson: "[]",
            ProviderId: optedInDoctor.Id,
            ProviderName: "Dr. Rafael Mendoza"));
        draftId.Should().NotBeEmpty();

        await AssertAllHubEnvelopesAreObjectKeyOnlyAndCompactAsync(cell.Hub);
        await cell.Clinic.AssertNothingStuckAsync();
        await cell.Patient.AssertNothingStuckAsync();
        await portal.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task FunctionalCheck3_ClinicianRosterVerification_MultiClinicGrouping_VerifyPractitionerLink_AndImmediateRevocation()
    {
        await using var cell = new TestCell();
        using var portal = new PortalVerificationHost(cell.Hub);

        var clinicNorth = await ProvisionClinicAsync(cell, portal, "north-clinic", "Manila Care North", isPatientDiscoveryEligible: true);
        var clinicSouth = await ProvisionClinicAsync(cell, portal, "south-clinic", "Makati Care South", isPatientDiscoveryEligible: true);

        await SeedClinicOperationalSetupAsync(cell, clinicNorth, "DOH-LTO-NORTH-01", "verification/lto/north.pdf");
        await SeedClinicOperationalSetupAsync(cell, clinicSouth, "DOH-LTO-SOUTH-01", "verification/lto/south.pdf");

        // Local medical directors (IsDirectoryOptIn = false) satisfy facility readiness without entering public search.
        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new CreateStaffMemberCommand(
            FirstName: "Arthur",
            LastName: "Navarro",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "director.north@clinicez.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "0011223",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "General Practice",
            InitialPassword: "ClinicPass2026!",
            IsDirectoryOptIn: false));

        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new CreateStaffMemberCommand(
            FirstName: "Beatriz",
            LastName: "Lim",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "director.south@clinicez.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "0011224",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "General Practice",
            InitialPassword: "ClinicPass2026!",
            IsDirectoryOptIn: false));

        // Approve both clinics first so public search shows verified clinicians from both clinics
        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new PublishClinicToDirectoryCommand(true));
        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new PublishClinicToDirectoryCommand(true));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var facReqs = await portal.DbAsync(db => db.FacilityVerificationRequests.ToListAsync());
        foreach (var req in facReqs)
        {
            await portal.SendAsync(new ApproveVerificationRequestCommand(req.Id, "admin_1", "Verifier One", "Facility approved"));
        }
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // 1. Clinic North registers & submits an opted-in Doctor + an opted-in Nurse
        var doctorNorth = await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new CreateStaffMemberCommand(
            FirstName: "Elena",
            LastName: "Reyes",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "elena.north@clinicez.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "PRC-0099887",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Cardiology",
            InitialPassword: "ClinicPass2026!",
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/elena-north.pdf",
            VerificationContact: "elena.reyes@clinicez.ph",
            PublicBio: "Interventional cardiologist."));

        var nurseNorth = await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new CreateStaffMemberCommand(
            FirstName: "Carlo",
            LastName: "Mendoza",
            MiddleName: null,
            Title: "RN",
            Role: StaffRole.Nurse,
            ClinicRoleId: null,
            Email: "carlo.rn@clinicez.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "0554433",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Primary Care Nursing",
            InitialPassword: "ClinicPass2026!",
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/carlo-nurse.pdf",
            VerificationContact: "carlo.rn@clinicez.ph",
            PublicBio: "Registered triage and immunization nurse."));

        await SeedWeeklyScheduleAsync(cell, clinicNorth, doctorNorth.Id, "Dr. Elena Reyes", DayOfWeek.Monday, new TimeOnly(9, 0), new TimeOnly(17, 0));
        await SeedWeeklyScheduleAsync(cell, clinicNorth, nurseNorth.Id, "Carlo Mendoza", DayOfWeek.Tuesday, new TimeOnly(8, 0), new TimeOnly(16, 0));

        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new SubmitPractitionerVerificationCommand(doctorNorth.Id));
        await cell.Clinic.SendAsync(clinicNorth.Tenant, clinicNorth.Id, new SubmitPractitionerVerificationCommand(nurseNorth.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var northPracReqs = await portal.DbAsync(db =>
            db.PractitionerVerificationRequests.Where(r => r.FacilityId == clinicNorth.Id).ToListAsync());
        northPracReqs.Should().HaveCount(2);

        Guid canonicalDoctorId = Guid.Empty;
        foreach (var req in northPracReqs)
        {
            var res = await portal.SendAsync(new ApproveVerificationRequestCommand(req.Id, "admin_1", "Verifier One", "PRC verified"));
            if (req.ClinicStaffMemberId == doctorNorth.Id)
                canonicalDoctorId = res.ApprovedPractitionerIds.Single();
        }
        canonicalDoctorId.Should().NotBeEmpty();
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var northDoctorEntity = await cell.Clinic.DbAsync(db => db.StaffMembers.IgnoreQueryFilters().FirstAsync(s => s.Id == doctorNorth.Id));
        northDoctorEntity.CanonicalProviderId.Should().Be(canonicalDoctorId);
        northDoctorEntity.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Verified);

        // 2. Clinic South registers & submits the SAME doctor (formatted PRC "99887" -> normalizes to "0099887")
        var doctorSouth = await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new CreateStaffMemberCommand(
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
            Specialty: "Internal Medicine",
            InitialPassword: "ClinicPass2026!",
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/elena-south.pdf",
            VerificationContact: "elena.reyes@clinicez.ph"));

        await SeedWeeklyScheduleAsync(cell, clinicSouth, doctorSouth.Id, "Dr. Elena Reyes", DayOfWeek.Wednesday, new TimeOnly(10, 0), new TimeOnly(16, 0));

        await cell.Clinic.SendAsync(clinicSouth.Tenant, clinicSouth.Id, new SubmitPractitionerVerificationCommand(doctorSouth.Id));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // Portal detects clean PRC + name match -> AwaitingOtp and sends /verify/practitioner?token=... confirmation email
        var southReq = await portal.DbAsync(db => db.PractitionerVerificationRequests.SingleAsync(r => r.FacilityId == clinicSouth.Id));
        southReq.Status.Should().Be("AwaitingOtp");
        southReq.PractitionerId.Should().Be(canonicalDoctorId);

        var confirmationEmail = portal.Notifications.Sent.Should().ContainSingle(m =>
            m.Payload.TemplateKey == EmailTemplateKeys.PractitionerAffiliationConfirmation).Subject.Payload;
        var confirmUrl = confirmationEmail.Model["confirmUrl"];
        var otpCode = confirmationEmail.Model["otpCode"];

        confirmUrl.Should().StartWith("https://portal.clinicez.ph/verify/practitioner?token=");
        confirmUrl.Should().NotContain("/confirm-affiliation");

        var rendered = new EmailTemplateRenderer().Render(
            confirmationEmail.TemplateKey,
            confirmationEmail.Subject,
            confirmationEmail.Model);
        rendered.Html.Should().Contain("/verify/practitioner?token=");
        rendered.Text.Should().Contain("/verify/practitioner?token=");

        var token = Uri.UnescapeDataString(confirmUrl.Split("token=", 2)[1]);
        var confirmResult = await portal.SendAsync(new ConfirmPractitionerAffiliationCommand(token, otpCode));
        confirmResult.PractitionerId.Should().Be(canonicalDoctorId);
        confirmResult.AffiliationStatus.Should().Be("Active");

        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        // Both Clinic North and Clinic South StaffMember rows now share the same canonical PractitionerId
        var southDoctorEntity = await cell.Clinic.DbAsync(db => db.StaffMembers.IgnoreQueryFilters().FirstAsync(s => s.Id == doctorSouth.Id));
        southDoctorEntity.CanonicalProviderId.Should().Be(canonicalDoctorId);
        southDoctorEntity.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Verified);

        // 3. patient-api DirectoryCatalogSearchService returns ONE grouped DirectoryDoctorDto with BOTH clinics in affiliations[]
        var doctorSearch = await SearchDirectoryAsync(cell, "Elena Reyes", "doctors");
        var groupedDoctor = doctorSearch.Doctors.Should().ContainSingle().Subject;
        groupedDoctor.PractitionerId.Should().Be(canonicalDoctorId);
        groupedDoctor.IsVerified.Should().BeTrue();
        groupedDoctor.Affiliations.Should().NotBeNull();
        groupedDoctor.Affiliations!.Should().HaveCount(2);
        groupedDoctor.Affiliations.Select(a => a.ClinicId).Should().BeEquivalentTo([clinicNorth.Id, clinicSouth.Id]);
        groupedDoctor.Affiliations.Should().Contain(a => a.ClinicId == clinicNorth.Id && a.LocalSpecialty == "Cardiology" && a.Availabilities.Count == 1);
        groupedDoctor.Affiliations.Should().Contain(a => a.ClinicId == clinicSouth.Id && a.LocalSpecialty == "Internal Medicine" && a.Availabilities.Count == 1);

        var profile = await GetPractitionerProfileAsync(cell, canonicalDoctorId);
        profile.Should().NotBeNull();
        profile!.Affiliations.Should().HaveCount(2);

        var nurseSearch = await SearchDirectoryAsync(cell, "Carlo Mendoza", "doctors");
        nurseSearch.Doctors.Should().ContainSingle(d => d.Role == "Nurse" && d.IsVerified);
        (await SearchDirectoryAsync(cell, "Navarro", "doctors")).Doctors.Should().BeEmpty();
        (await SearchDirectoryAsync(cell, "Lim", "doctors")).Doctors.Should().BeEmpty();

        // 4. Revocation removes doctor from public search immediately and updates both clinics
        await portal.SendAsync(new SuspendPractitionerCommand(
            canonicalDoctorId,
            "admin_1",
            "Verifier One",
            "PRC license suspended pending regulatory review."));
        await Cell.PumpAsync([cell.Clinic, cell.Patient, portal]);

        var northAfterRevoke = await cell.Clinic.DbAsync(db => db.StaffMembers.IgnoreQueryFilters().FirstAsync(s => s.Id == doctorNorth.Id));
        var southAfterRevoke = await cell.Clinic.DbAsync(db => db.StaffMembers.IgnoreQueryFilters().FirstAsync(s => s.Id == doctorSouth.Id));
        northAfterRevoke.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Suspended);
        northAfterRevoke.AffiliatedVerifiedClinicCount.Should().Be(0);
        southAfterRevoke.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Suspended);
        southAfterRevoke.AffiliatedVerifiedClinicCount.Should().Be(0);

        var searchAfterRevoke = await SearchDirectoryAsync(cell, "Elena Reyes", "doctors");
        searchAfterRevoke.Doctors.Should().BeEmpty("revoked practitioner must disappear from public search immediately");
        (await GetPractitionerProfileAsync(cell, canonicalDoctorId)).Should().BeNull();

        // Unrelated Nurse remains verified and searchable
        (await SearchDirectoryAsync(cell, "Carlo Mendoza", "doctors")).Doctors.Should().ContainSingle();

        var portalAudits = await portal.DbAsync(db =>
            db.WorkspaceAuditEntries
                .Where(a => a.Section == DirectoryVerificationHelper.AuditSection)
                .Select(a => a.Action)
                .ToListAsync());
        portalAudits.Should().Contain(["practitioner-submitted", "practitioner-approved", "affiliation-confirmed", "practitioner-suspended"]);

        await AssertAllHubEnvelopesAreObjectKeyOnlyAndCompactAsync(cell.Hub);
        await cell.Clinic.AssertNothingStuckAsync();
        await cell.Patient.AssertNothingStuckAsync();
        await portal.AssertNothingStuckAsync();
    }
}
