using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Middlewares;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Schedules.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Services;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.DirectoryVerification;

public sealed class PendingVerificationSyncTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private const string TenantId = "tenant-pending-218";

    public PendingVerificationSyncTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.StaffName.Returns("Dr. Clara Reyes");
        _clinicContext.StaffRole.Returns("Admin");
    }

    private (ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext Db,
        IUnitOfWork Uow,
        IRepository<FacilitySettings> SettingsRepo,
        IRepository<StaffMember> StaffRepo,
        IRepository<ServiceItem> ServicesRepo,
        IRepository<DoctorScheduleTemplate> ScheduleRepo,
        IRepository<DoctorBreakTime> BreakRepo,
        IRepository<Role> RoleRepo,
        IRepository<AuditEntry> AuditRepo) CreateRepos(IClinicContext? ctx = null)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx ?? _clinicContext);
        return (
            db,
            uow,
            TestDbHelper.CreateRepository<FacilitySettings>(db, sieve),
            TestDbHelper.CreateRepository<StaffMember>(db, sieve),
            TestDbHelper.CreateRepository<ServiceItem>(db, sieve),
            TestDbHelper.CreateRepository<DoctorScheduleTemplate>(db, sieve),
            TestDbHelper.CreateRepository<DoctorBreakTime>(db, sieve),
            TestDbHelper.CreateRepository<Role>(db, sieve),
            TestDbHelper.CreateRepository<AuditEntry>(db, sieve));
    }

    #region 1. Exception Handlers (409 & 503)

    [Fact]
    public async Task ClinicExceptionHandler_MapsVerificationConflictException_ToHttp409WithErrorCodeAndData()
    {
        var requestId = Guid.NewGuid();
        var ex = new VerificationConflictException("Already approved.", currentStatus: "Approved", requestId: requestId);

        var httpContext = new DefaultHttpContext();
        httpContext.Response.Body = new MemoryStream();

        var handled = await new ClinicExceptionHandler().TryHandleAsync(httpContext, ex, CancellationToken.None);

        handled.Should().BeTrue();
        httpContext.Response.StatusCode.Should().Be(StatusCodes.Status409Conflict);
        httpContext.Response.Body.Position = 0;

        using var doc = await JsonDocument.ParseAsync(httpContext.Response.Body);
        var root = doc.RootElement;
        root.GetProperty("succeeded").GetBoolean().Should().BeFalse();
        root.GetProperty("errorCode").GetString().Should().Be("verification_request_not_pending");
        root.GetProperty("errors")[0].GetProperty("code").GetString().Should().Be("verification_request_not_pending");
        root.GetProperty("data").GetProperty("currentStatus").GetString().Should().Be("Approved");
        root.GetProperty("data").GetProperty("requestId").GetGuid().Should().Be(requestId);
    }

    [Fact]
    public async Task GlobalExceptionHandler_MapsServiceUnavailableException_ToHttp503()
    {
        var ex = new ServiceUnavailableException("Portal timed out.");
        var httpContext = new DefaultHttpContext();
        httpContext.Response.Body = new MemoryStream();

        var handled = await new GlobalExceptionHandler().TryHandleAsync(httpContext, ex, CancellationToken.None);

        handled.Should().BeTrue();
        httpContext.Response.StatusCode.Should().Be(StatusCodes.Status503ServiceUnavailable);
        httpContext.Response.Body.Position = 0;

        using var doc = await JsonDocument.ParseAsync(httpContext.Response.Body);
        doc.RootElement.GetProperty("errorCode").GetString().Should().Be("SERVICE_UNAVAILABLE");
    }

    #endregion

    #region 2. ClinicDirectorySyncService (Explicit & Implicit)

    [Fact]
    public async Task SyncPendingFacilityVerification_SendsExpectedStatusPendingReview_Handles409And503AndOfflineFallback()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, _, _) = CreateRepos();
        var settings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Sunrise Clinic",
            OperatingHours = "Mon-Sat 8AM-5PM",
            LetterheadDohLto = "LTO-123",
            DohLtoExpiryDate = new DateOnly(2028, 1, 15),
            AccreditationNumber = "PHIC-001",
            IsPhilHealthConfigured = true,
            EnableTeleconsultation = true,
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload
        {
            Succeeded = true,
            RequestId = Guid.NewGuid(),
            CurrentStatus = "PendingReview",
            UpdatedAtUtc = DateTime.UtcNow
        });

        var sync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, publisher, scheduleRepo, settingsRepo, client, uow, _clinicContext, NullLogger<ClinicDirectorySyncService>.Instance);

        await sync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: true);
        client.Calls.Should().ContainSingle(c => c.RequestType == InteropTypes.FacilityVerificationUpdateRequested);
        var sent = (FacilityVerificationUpdateRequestedPayload)client.Calls[0].Payload;
        sent.ExpectedStatus.Should().Be("PendingReview");
        sent.DohLtoExpiryDate.Should().Be(new DateOnly(2028, 1, 15));
        sent.PhilHealthAccreditationNumber.Should().Be("PHIC-001");
        sent.IsPhilHealthAccredited.Should().BeTrue();
        sent.SupportsInPerson.Should().BeTrue();
        sent.SupportsTeleconsult.Should().BeTrue();
        sent.SubmittedByDisplayName.Should().Be("Dr. Clara Reyes");

        // Conflict from Portal -> throws VerificationConflictException when throwOnConflict=true, ignored when false
        var conflictClient = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload
        {
            Succeeded = false,
            Conflict = true,
            ErrorCode = "verification_request_not_pending",
            CurrentStatus = "Approved",
            Message = "Request already approved.",
            RequestId = Guid.NewGuid()
        });
        var conflictSync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, publisher, scheduleRepo, settingsRepo, conflictClient, uow, _clinicContext);

        var conflictAct = () => conflictSync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: true);
        var ex = await conflictAct.Should().ThrowAsync<VerificationConflictException>();
        ex.Which.CurrentStatus.Should().Be("Approved");

        await conflictSync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: false); // must not throw

        // Timeout -> ServiceUnavailableException on throwOnConflict=true; outbox enqueue + save on throwOnConflict=false
        var mockUow = Substitute.For<IUnitOfWork>();
        var timeoutClient = new StubInteropRequestClient(_ => throw new InvalidOperationException("unused"))
        {
            Failure = new InteropRequestTimeoutException("facility.verification.update.requested", Guid.NewGuid(), TimeSpan.FromSeconds(15))
        };
        var timeoutSync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, publisher, scheduleRepo, settingsRepo, timeoutClient, mockUow, _clinicContext);

        await ((Func<Task>)(() => timeoutSync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: true)))
            .Should().ThrowAsync<ServiceUnavailableException>();

        await timeoutSync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: false);
        publisher.Received(1).Enqueue(
            InteropTypes.FacilityVerificationUpdateRequested,
            Arg.Any<Party>(),
            Party.Portal,
            _clinicId,
            Arg.Any<FacilityVerificationUpdateRequestedPayload>());
        await mockUow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SyncPendingPractitionerVerification_SendsExpectedStatusNull_AndResolvesSubmitterFallback()
    {
        var noNameContext = Substitute.For<IClinicContext>();
        noNameContext.ClinicId.Returns(_clinicId);
        noNameContext.TenantId.Returns(TenantId);
        noNameContext.StaffId.Returns(_staffId);
        noNameContext.StaffName.Returns((string?)null);

        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, _, _) = CreateRepos(noNameContext);
        var docId = Guid.NewGuid();

        await staffRepo.AddAsync(new StaffMember
        {
            Id = _staffId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Marco",
            LastName = "Alvarez",
            Role = StaffRole.Admin,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = docId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Sofia",
            LastName = "Cruz",
            Title = "Dr.",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0887766",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "tenants/t/clinics/c/prc.pdf",
            VerificationContact = "sofia@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload { Succeeded = true });
        var sync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, publisher, scheduleRepo, settingsRepo, client, uow, noNameContext);

        await sync.SyncPendingPractitionerVerificationAsync(docId, throwOnConflict: true);

        client.Calls.Should().ContainSingle(c => c.RequestType == InteropTypes.PractitionerVerificationUpdateRequested);
        var payload = (PractitionerVerificationUpdateRequestedPayload)client.Calls[0].Payload;
        payload.ExpectedStatus.Should().BeNull(); // M1 advisory: supports both PendingReview and AwaitingOtp
        payload.SubmittedByDisplayName.Should().Be("Marco Alvarez");
    }

    #endregion

    #region 3. Explicit /pending Commands & Submit Guard

    [Fact]
    public async Task ExplicitPendingCommands_AndSubmitGuard_EnforcePendingStatus()
    {
        var (_, uow, settingsRepo, staffRepo, _, _, _, _, auditRepo) = CreateRepos();
        var docId = Guid.NewGuid();

        var settings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Pending Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        };
        var doctor = new StaffMember
        {
            Id = docId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Ana",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0665544",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "tenants/t/clinics/c/prc-ana.pdf",
            VerificationContact = "ana@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            IsActive = true
        };
        await settingsRepo.AddAsync(settings);
        await staffRepo.AddAsync(doctor);
        await uow.SaveChangesAsync();

        var syncService = Substitute.For<IClinicDirectorySyncService>();
        var facHandler = new UpdatePendingFacilityVerificationCommandHandler(settingsRepo, syncService, _clinicContext, uow, auditRepo);
        var pracHandler = new UpdatePendingPractitionerVerificationCommandHandler(staffRepo, syncService, _clinicContext, uow, auditRepo);

        var facRes = await facHandler.Handle(new UpdatePendingFacilityVerificationCommand(), CancellationToken.None);
        facRes.Success.Should().BeTrue();
        await syncService.Received(1).SyncPendingFacilityVerificationAsync(settings, true, _staffId.ToString(), "Dr. Clara Reyes", Arg.Any<CancellationToken>());

        var pracRes = await pracHandler.Handle(new UpdatePendingPractitionerVerificationCommand(docId), CancellationToken.None);
        pracRes.Id.Should().Be(docId);
        await syncService.Received(1).SyncPendingPractitionerVerificationAsync(docId, true, _staffId.ToString(), "Dr. Clara Reyes", Arg.Any<CancellationToken>());

        // Guard blocks SubmitPractitionerVerificationCommand when already PendingVerification
        var submitHandler = new SubmitPractitionerVerificationCommandHandler(staffRepo, _clinicContext, uow, Substitute.For<IInteropPublisher>(), syncService);
        await ((Func<Task>)(() => submitHandler.Handle(new SubmitPractitionerVerificationCommand(docId), CancellationToken.None)))
            .Should().ThrowAsync<VerificationConflictException>();

        // Non-pending statuses throw VerificationConflictException (409)
        foreach (var status in new[] { PlatformVerificationStatus.Verified, PlatformVerificationStatus.Rejected, PlatformVerificationStatus.Unverified })
        {
            settings.PlatformVerificationStatus = status;
            await ((Func<Task>)(() => facHandler.Handle(new UpdatePendingFacilityVerificationCommand(), CancellationToken.None)))
                .Should().ThrowAsync<VerificationConflictException>();
        }

        foreach (var status in new[] { PractitionerVerificationLevel.Verified, PractitionerVerificationLevel.Rejected, PractitionerVerificationLevel.Unverified })
        {
            doctor.PublicVerificationStatus = status;
            await ((Func<Task>)(() => pracHandler.Handle(new UpdatePendingPractitionerVerificationCommand(docId), CancellationToken.None)))
                .Should().ThrowAsync<VerificationConflictException>();
        }
    }

    #endregion

    #region 4. All 11 Implicit CRUD Handlers, Dirty Guards, Save-Before-Sync & Skip Flag

    [Fact]
    public async Task SettingsAndLtoHandlers_SyncOnlyOnDirectoryFieldChangesAndRespectSkipFlag()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, _, _) = CreateRepos();
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Initial Name",
            OperatingHours = "8AM-5PM",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        });
        await uow.SaveChangesAsync();

        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload { Succeeded = true });
        var sync = new ClinicDirectorySyncService(staffRepo, servicesRepo, Substitute.For<IInteropPublisher>(), scheduleRepo, settingsRepo, client, uow, _clinicContext);

        var settingsHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow, directorySyncService: sync);

        // Non-directory edit (PrimaryColorHex / QueuePrefix) -> 0 sync calls
        await settingsHandler.Handle(new UpdateClinicSettingsCommand(PrimaryColorHex: "#111111", QueuePrefix: "Z"), CancellationToken.None);
        client.Calls.Should().BeEmpty();

        // Directory edit (ClinicName + DohLtoExpiryDate) -> 1 sync call
        var newExpiry = new DateOnly(2029, 5, 1);
        await settingsHandler.Handle(new UpdateClinicSettingsCommand(ClinicName: "Updated Name", DohLtoExpiryDate: newExpiry), CancellationToken.None);
        client.Calls.Should().HaveCount(1);
        var payload = (FacilityVerificationUpdateRequestedPayload)client.Calls[0].Payload;
        payload.FacilityName.Should().Be("Updated Name");
        payload.DohLtoExpiryDate.Should().Be(newExpiry);

        // SkipPendingVerificationSync = true -> suppressed
        await settingsHandler.Handle(new UpdateClinicSettingsCommand(OperatingHours: "9AM-6PM", SkipPendingVerificationSync: true), CancellationToken.None);
        client.Calls.Should().HaveCount(1);

        // UploadLtoProofCommand
        var storage = Substitute.For<IClinicStorageService>();
        storage.SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<string>(0));
        var ltoHandler = new UploadLtoProofCommandHandler(settingsRepo, storage, _clinicContext, uow, directorySyncService: sync);
        var bytes = "%PDF-1.4\nlto"u8.ToArray();

        await ltoHandler.Handle(new UploadLtoProofCommand("lto.pdf", "application/pdf", bytes.Length, bytes), CancellationToken.None);
        client.Calls.Should().HaveCount(2);

        await ltoHandler.Handle(new UploadLtoProofCommand("lto2.pdf", "application/pdf", bytes.Length, bytes, SkipPendingVerificationSync: true), CancellationToken.None);
        client.Calls.Should().HaveCount(2);
    }

    [Fact]
    public async Task AllFourServiceHandlers_SaveBeforeSyncing_AndRespectDirtyAndSkipFlags()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, _, _) = CreateRepos();
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Services Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        });
        await uow.SaveChangesAsync();

        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload { Succeeded = true });
        var sync = new ClinicDirectorySyncService(staffRepo, servicesRepo, Substitute.For<IInteropPublisher>(), scheduleRepo, settingsRepo, client, uow, _clinicContext);

        // 1. CreateClinicServiceItemCommand -> newly created service is visible in synced payload
        var createHandler = new CreateClinicServiceItemCommandHandler(servicesRepo, uow, _clinicContext, settingsRepo, sync);
        var created = await createHandler.Handle(new CreateClinicServiceItemCommand("LAB-01", "CBC", "Laboratory", 250m), CancellationToken.None);
        client.Calls.Should().HaveCount(1);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls[0].Payload).Services.Should().Contain(s => s.ServiceId == created.Id && s.Name == "CBC");

        // 2. UpdateClinicServiceItemCommand -> updated price visible; inactive-only metadata edit skipped
        var updateHandler = new UpdateClinicServiceItemCommandHandler(servicesRepo, uow, _clinicContext, settingsRepo, sync);
        await updateHandler.Handle(new UpdateClinicServiceItemCommand(created.Id, "CBC Complete", "Laboratory", 300m, IsActive: true), CancellationToken.None);
        client.Calls.Should().HaveCount(2);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls[1].Payload).Services.Should().Contain(s => s.Name == "CBC Complete" && s.StandardPrice == 300m);

        // Deactivate then edit description on inactive service -> deactivation syncs, subsequent inactive metadata edit does NOT sync
        await updateHandler.Handle(new UpdateClinicServiceItemCommand(created.Id, "CBC Complete", "Laboratory", 300m, IsActive: false), CancellationToken.None);
        client.Calls.Should().HaveCount(3);
        await updateHandler.Handle(new UpdateClinicServiceItemCommand(created.Id, "CBC Complete", "Laboratory", 300m, Description: "Inactive desc", IsActive: false), CancellationToken.None);
        client.Calls.Should().HaveCount(3);

        // 3. BulkImportServicesCommand
        var bulkHandler = new BulkImportServicesCommandHandler(servicesRepo, uow, _clinicContext, settingsRepo, sync);
        await bulkHandler.Handle(new BulkImportServicesCommand([new BulkImportServiceItemDto("XRAY-01", "Chest X-Ray", "Radiology", 600m)]), CancellationToken.None);
        client.Calls.Should().HaveCount(4);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls[3].Payload).Services.Should().Contain(s => s.Name == "Chest X-Ray");

        // Skip flag suppresses
        await bulkHandler.Handle(new BulkImportServicesCommand([new BulkImportServiceItemDto("ECG-01", "ECG", "Cardiology", 500m)], SkipPendingVerificationSync: true), CancellationToken.None);
        client.Calls.Should().HaveCount(4);

        // 4. SeedDentalServicesCommand
        var seedHandler = new SeedDentalServicesCommandHandler(servicesRepo, uow, _clinicContext, settingsRepo, sync);
        await seedHandler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);
        client.Calls.Should().HaveCount(5);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls[4].Payload).Services.Count.Should().BeGreaterThan(2);
    }

    [Fact]
    public async Task StaffAndScheduleHandlers_RoutePendingSyncCorrectly_AndIgnorePreferencesJsonAutoSave()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, breakRepo, roleRepo, auditRepo) = CreateRepos();
        var verifiedDocId = Guid.NewGuid();
        var pendingDocId = _staffId;

        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Staff Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        });

        await staffRepo.AddAsync(new StaffMember
        {
            Id = pendingDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Clara",
            LastName = "Reyes",
            Title = "Dr.",
            Role = StaffRole.Doctor,
            Specialty = "Pediatrics",
            PrcLicenseNumber = "PRC-0111222",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "tenants/t/clinics/c/prc-clara.pdf",
            VerificationContact = "clara@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = verifiedDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Mateo",
            LastName = "Diaz",
            Role = StaffRole.Doctor,
            Specialty = "Internal Medicine",
            PrcLicenseNumber = "PRC-0333444",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "tenants/t/clinics/c/prc-mateo.pdf",
            VerificationContact = "mateo@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Verified,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload { Succeeded = true });
        var sync = new ClinicDirectorySyncService(staffRepo, servicesRepo, publisher, scheduleRepo, settingsRepo, client, uow, _clinicContext);

        // 1. UpdateMyProfileCommand: PreferencesJson / PhoneNumber / PtrNumber ONLY -> 0 sync calls!
        var myProfileHandler = new UpdateMyProfileCommandHandler(
            staffRepo, uow, _clinicContext, interopPublisher: publisher, settingsRepository: settingsRepo, scheduleRepository: scheduleRepo, auditRepository: auditRepo, directorySyncService: sync);

        await myProfileHandler.Handle(new UpdateMyProfileCommand(
            pendingDocId, "Clara", "Reyes", null, "Dr.", "+639171111111", "PRC-0111222", "PTR-99", null, "Pediatrics",
            PreferencesJson: "{\"theme\":\"teal\"}",
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey: "tenants/t/clinics/c/prc-clara.pdf",
            VerificationContact: "clara@clinic.ph"), CancellationToken.None);
        client.Calls.Should().BeEmpty();

        // Directory field change (PublicBio) -> syncs practitioner.verification.update.requested
        await myProfileHandler.Handle(new UpdateMyProfileCommand(
            pendingDocId, "Clara", "Reyes", null, "Dr.", "+639171111111", "PRC-0111222", "PTR-99", null, "Pediatrics",
            PublicBio: "Pediatric specialist",
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey: "tenants/t/clinics/c/prc-clara.pdf",
            VerificationContact: "clara@clinic.ph"), CancellationToken.None);
        client.Calls.Should().ContainSingle(c => c.RequestType == InteropTypes.PractitionerVerificationUpdateRequested);

        // 2. UpdateStaffMemberCommand: PRC change on Verified clinician fires PrcUpdate resubmission WITHOUT double-syncing
        var updateStaffHandler = new UpdateStaffMemberCommandHandler(
            staffRepo, roleRepo, uow, _clinicContext, interopPublisher: publisher, settingsRepository: settingsRepo, scheduleRepository: scheduleRepo, auditRepository: auditRepo, directorySyncService: sync);

        await updateStaffHandler.Handle(new UpdateStaffMemberCommand(
            verifiedDocId, "Mateo", "Diaz", null, null, StaffRole.Doctor, null, null, null, "PRC-0999888", null, null, "Internal Medicine", true,
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey: "tenants/t/clinics/c/prc-mateo.pdf",
            VerificationContact: "mateo@clinic.ph"), CancellationToken.None);
        publisher.Received(1).Enqueue(InteropTypes.PractitionerVerificationRequested, Arg.Any<Party>(), Party.Portal, verifiedDocId, Arg.Is<PractitionerVerificationRequestedPayload>(p => p.RequestKind == "PrcUpdate"));
        client.Calls.Should().HaveCount(1); // no extra update.requested call

        // 3. UploadStaffPrcProofCommand
        var storage = Substitute.For<IClinicStorageService>();
        storage.SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<string>(0));
        var prcProofHandler = new UploadStaffPrcProofCommandHandler(staffRepo, storage, _clinicContext, uow, settingsRepo: settingsRepo, directorySyncService: sync);
        var pdf = "%PDF-1.4\nprc"u8.ToArray();
        await prcProofHandler.Handle(new UploadStaffPrcProofCommand(pendingDocId, "prc.pdf", "application/pdf", pdf.Length, pdf), CancellationToken.None);
        client.Calls.Should().HaveCount(2);

        // 4. UpsertDoctorScheduleTemplateCommand & DeleteDoctorScheduleTemplateCommand
        var upsertSchedule = new UpsertDoctorScheduleTemplateCommandHandler(scheduleRepo, breakRepo, staffRepo, uow, _clinicContext, settingsRepo, sync);
        var tmpl = await upsertSchedule.Handle(new UpsertDoctorScheduleTemplateCommand(
            pendingDocId, "Dr. Clara Reyes", DayOfWeek.Monday, new TimeOnly(9, 0), new TimeOnly(12, 0)), CancellationToken.None);
        client.Calls.Should().HaveCount(3);
        ((PractitionerVerificationUpdateRequestedPayload)client.Calls[2].Payload).Availabilities.Should().ContainSingle(a => a.DayOfWeek == DayOfWeek.Monday);

        var deleteSchedule = new DeleteDoctorScheduleTemplateCommandHandler(scheduleRepo, uow, _clinicContext, staffRepo, settingsRepo, sync);
        await deleteSchedule.Handle(new DeleteDoctorScheduleTemplateCommand(pendingDocId, tmpl.Id), CancellationToken.None);
        client.Calls.Should().HaveCount(4);
        ((PractitionerVerificationUpdateRequestedPayload)client.Calls[3].Payload).Availabilities.Should().BeEmpty();

        // Skip flag suppresses schedule sync
        await upsertSchedule.Handle(new UpsertDoctorScheduleTemplateCommand(
            pendingDocId, "Dr. Clara Reyes", DayOfWeek.Tuesday, new TimeOnly(9, 0), new TimeOnly(12, 0), SkipPendingVerificationSync: true), CancellationToken.None);
        client.Calls.Should().HaveCount(4);

        // Editing a Verified clinician's bio/specialty (no PRC change) while facility is PendingReview syncs facility.verification.update.requested
        await updateStaffHandler.Handle(new UpdateStaffMemberCommand(
            verifiedDocId, "Mateo", "Diaz", null, null, StaffRole.Doctor, null, null, null, "PRC-0999888", null, null, "Pulmonology", true,
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey: "tenants/t/clinics/c/prc-mateo.pdf",
            VerificationContact: "mateo@clinic.ph"), CancellationToken.None);
        // Note: verifiedDocId was moved to PendingVerification by the PRC update above, so this syncs practitioner;
        // add an opted-in Unverified/Rejected clinician to verify facility sync routing too
        var unverifiedDocId = Guid.NewGuid();
        await staffRepo.AddAsync(new StaffMember
        {
            Id = unverifiedDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Leo",
            LastName = "Nunez",
            Role = StaffRole.Doctor,
            Specialty = "Dermatology",
            PrcLicenseNumber = "PRC-0551122",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "tenants/t/clinics/c/prc-leo.pdf",
            VerificationContact = "leo@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Unverified,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        await updateStaffHandler.Handle(new UpdateStaffMemberCommand(
            unverifiedDocId, "Leo", "Nunez", null, null, StaffRole.Doctor, null, null, null, "PRC-0551122", null, null, "Clinical Dermatology", true,
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey: "tenants/t/clinics/c/prc-leo.pdf",
            VerificationContact: "leo@clinic.ph"), CancellationToken.None);
        client.Calls.Last().RequestType.Should().Be(InteropTypes.FacilityVerificationUpdateRequested);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls.Last().Payload).Practitioners
            .Should().Contain(p => p.ClinicStaffMemberId == unverifiedDocId && p.Specialty == "Clinical Dermatology");

        // PhilHealth Override, Revert & Booking Pause while PendingReview sync facility
        var proxyClient = Substitute.For<IPhilHealthProxyClient>();
        proxyClient.ConfigureTenantCredentialsAsync(Arg.Any<ConfigurePhilHealthCredentialsProxyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<PhilHealthConfigStatusResponse>.Success(
                new PhilHealthConfigStatusResponse(
                    _clinicId, "Staff Clinic", "PHIC-OV-1", "PMCC-1", "SW-1", "/soap/konsulta", true, true, DateTimeOffset.UtcNow)));
        var overrideHandler = new OverridePhilHealthSettingsCommandHandler(settingsRepo, _clinicContext, uow, proxyClient, sync);
        await overrideHandler.Handle(new OverridePhilHealthSettingsCommand("PHIC-OV-1", "PMCC-1", "SW-1", null, null, null), CancellationToken.None);
        client.Calls.Last().RequestType.Should().Be(InteropTypes.FacilityVerificationUpdateRequested);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls.Last().Payload).PhilHealthAccreditationNumber.Should().Be("PHIC-OV-1");

        var revertHandler = new RevertPhilHealthToBranchCommandHandler(settingsRepo, _clinicContext, uow, sync);
        await revertHandler.Handle(new RevertPhilHealthToBranchCommand(), CancellationToken.None);
        client.Calls.Last().RequestType.Should().Be(InteropTypes.FacilityVerificationUpdateRequested);

        var pauseHandler = new ToggleOnlineBookingPauseCommandHandler(settingsRepo, _clinicContext, uow, publisher, sync);
        await pauseHandler.Handle(new ToggleOnlineBookingPauseCommand(true), CancellationToken.None);
        client.Calls.Last().RequestType.Should().Be(InteropTypes.FacilityVerificationUpdateRequested);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls.Last().Payload).IsOnlineBookingPaused.Should().BeTrue();
    }

    [Fact]
    public async Task SyncPendingFacilityVerification_TransitionsBundledUnverifiedAndRejectedClinicians_AndEnablesPractitionerPendingUpdate()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, _, auditRepo) = CreateRepos();
        var settings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Bundled Sync Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        };
        await settingsRepo.AddAsync(settings);

        var unverifiedDocId = Guid.NewGuid();
        var rejectedDocId = Guid.NewGuid();
        var verifiedDocId = Guid.NewGuid();
        var awaitingOtpDocId = Guid.NewGuid();
        var nonOptInDocId = Guid.NewGuid();

        await staffRepo.AddAsync(new StaffMember
        {
            Id = unverifiedDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Bob",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055002",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "verification/prc/bob.pdf",
            VerificationContact = "bob@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Unverified,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = rejectedDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Cara",
            LastName = "Lim",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055003",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "verification/prc/cara.pdf",
            VerificationContact = "cara@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Rejected,
            PublicVerificationReason = "Old blurry PRC",
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = verifiedDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Elena",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055004",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "verification/prc/elena.pdf",
            VerificationContact = "elena@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Verified,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = awaitingOtpDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Dante",
            LastName = "Vega",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055005",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "verification/prc/dante.pdf",
            VerificationContact = "dante@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.AwaitingConfirmation,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = nonOptInDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Gina",
            LastName = "Tan",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055006",
            IsDirectoryOptIn = false,
            PublicVerificationStatus = PractitionerVerificationLevel.Unverified,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload
        {
            Succeeded = true,
            CurrentStatus = "PendingReview",
            UpdatedAtUtc = DateTime.UtcNow
        });
        var sync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, Substitute.For<IInteropPublisher>(), scheduleRepo, settingsRepo, client, uow, _clinicContext);

        await sync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: true);

        var bob = await staffRepo.GetByIdAsync(unverifiedDocId);
        bob!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        bob.PublicVerificationReason.Should().BeNull();

        var cara = await staffRepo.GetByIdAsync(rejectedDocId);
        cara!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        cara.PublicVerificationReason.Should().BeNull();

        (await staffRepo.GetByIdAsync(verifiedDocId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Verified);
        (await staffRepo.GetByIdAsync(awaitingOtpDocId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.AwaitingConfirmation);
        (await staffRepo.GetByIdAsync(nonOptInDocId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);

        var pracPendingHandler = new UpdatePendingPractitionerVerificationCommandHandler(staffRepo, sync, _clinicContext, uow, auditRepo);
        var updatedBob = await pracPendingHandler.Handle(new UpdatePendingPractitionerVerificationCommand(unverifiedDocId), CancellationToken.None);
        updatedBob.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        client.Calls.Should().Contain(c => c.RequestType == InteropTypes.PractitionerVerificationUpdateRequested);
    }

    [Fact]
    public async Task SyncPendingFacilityVerification_ResetsRemovedOptOutPendingClinicians_WithoutMutatingVerifiedOrRejected()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, _, _) = CreateRepos();
        var settings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "OptOut Reset Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        };
        await settingsRepo.AddAsync(settings);

        var optOutPendingId = Guid.NewGuid();
        var optOutAwaitingId = Guid.NewGuid();
        var optOutVerifiedId = Guid.NewGuid();
        var optOutRejectedId = Guid.NewGuid();

        await staffRepo.AddAsync(new StaffMember
        {
            Id = optOutPendingId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Alice",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055101",
            IsDirectoryOptIn = false,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            PublicVerificationReason = "Pending review",
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = optOutAwaitingId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Bea",
            LastName = "Mendoza",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055102",
            IsDirectoryOptIn = false,
            PublicVerificationStatus = PractitionerVerificationLevel.AwaitingConfirmation,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = optOutVerifiedId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Carl",
            LastName = "Navarro",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055103",
            IsDirectoryOptIn = false,
            PublicVerificationStatus = PractitionerVerificationLevel.Verified,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = optOutRejectedId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Dana",
            LastName = "Aquino",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055104",
            IsDirectoryOptIn = false,
            PublicVerificationStatus = PractitionerVerificationLevel.Rejected,
            PublicVerificationReason = "Invalid PRC",
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload { Succeeded = true });
        var sync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, Substitute.For<IInteropPublisher>(), scheduleRepo, settingsRepo, client, uow, _clinicContext);

        await sync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: true);

        var alice = await staffRepo.GetByIdAsync(optOutPendingId);
        alice!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);
        alice.PublicVerificationReason.Should().BeNull();

        var bea = await staffRepo.GetByIdAsync(optOutAwaitingId);
        bea!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);
        bea.PublicVerificationReason.Should().BeNull();

        (await staffRepo.GetByIdAsync(optOutVerifiedId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Verified);
        var dana = await staffRepo.GetByIdAsync(optOutRejectedId);
        dana!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Rejected);
        dana.PublicVerificationReason.Should().Be("Invalid PRC");
    }

    [Fact]
    public async Task SyncPendingFacilityVerification_DoesNotTransitionClinicians_OnPortal409ConflictOrExplicit503Timeout()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, _, _) = CreateRepos();
        var settings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Conflict Guard Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        };
        await settingsRepo.AddAsync(settings);

        var unverifiedDocId = Guid.NewGuid();
        var optOutPendingId = Guid.NewGuid();
        await staffRepo.AddAsync(new StaffMember
        {
            Id = unverifiedDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Bob",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055201",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "verification/prc/bob.pdf",
            VerificationContact = "bob@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Unverified,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = optOutPendingId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Alice",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055202",
            IsDirectoryOptIn = false,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var conflictClient = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload
        {
            Succeeded = false,
            Conflict = true,
            ErrorCode = VerificationConflictException.ErrorCode,
            CurrentStatus = "Approved"
        });
        var conflictSync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, Substitute.For<IInteropPublisher>(), scheduleRepo, settingsRepo, conflictClient, uow, _clinicContext);

        await ((Func<Task>)(() => conflictSync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: true)))
            .Should().ThrowAsync<VerificationConflictException>();
        await conflictSync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: false);

        (await staffRepo.GetByIdAsync(unverifiedDocId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);
        (await staffRepo.GetByIdAsync(optOutPendingId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);

        var timeoutClient = new StubInteropRequestClient(_ => throw new InvalidOperationException("unused"))
        {
            Failure = new InteropRequestTimeoutException(InteropTypes.FacilityVerificationUpdateRequested, Guid.NewGuid(), TimeSpan.FromSeconds(15))
        };
        var timeoutSync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, Substitute.For<IInteropPublisher>(), scheduleRepo, settingsRepo, timeoutClient, uow, _clinicContext);

        await ((Func<Task>)(() => timeoutSync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: true)))
            .Should().ThrowAsync<ServiceUnavailableException>();

        (await staffRepo.GetByIdAsync(unverifiedDocId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);
        (await staffRepo.GetByIdAsync(optOutPendingId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
    }

    [Fact]
    public async Task SyncPendingFacilityVerification_OfflineOutboxFallback_PersistsClinicianTransitionAtomically()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, _, _) = CreateRepos();
        var settings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Offline Fallback Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        };
        await settingsRepo.AddAsync(settings);

        var unverifiedDocId = Guid.NewGuid();
        await staffRepo.AddAsync(new StaffMember
        {
            Id = unverifiedDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Bob",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055301",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "verification/prc/bob.pdf",
            VerificationContact = "bob@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Unverified,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var timeoutClient = new StubInteropRequestClient(_ => throw new InvalidOperationException("unused"))
        {
            Failure = new InteropRequestTimeoutException(InteropTypes.FacilityVerificationUpdateRequested, Guid.NewGuid(), TimeSpan.FromSeconds(15))
        };
        var sync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, publisher, scheduleRepo, settingsRepo, timeoutClient, uow, _clinicContext);

        await sync.SyncPendingFacilityVerificationAsync(settings, throwOnConflict: false);

        publisher.Received(1).Enqueue(
            InteropTypes.FacilityVerificationUpdateRequested,
            Arg.Any<Party>(),
            Party.Portal,
            _clinicId,
            Arg.Any<FacilityVerificationUpdateRequestedPayload>());
        (await staffRepo.GetByIdAsync(unverifiedDocId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
    }

    [Fact]
    public async Task UpdateStaffMember_ImplicitOptInWhileFacilityPending_UpdatesReturnedDtoAndDbToPendingVerification()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, roleRepo, auditRepo) = CreateRepos();
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Implicit OptIn Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        });

        var docId = Guid.NewGuid();
        await staffRepo.AddAsync(new StaffMember
        {
            Id = docId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Bob",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0055401",
            IsDirectoryOptIn = false,
            PublicVerificationStatus = PractitionerVerificationLevel.Unverified,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload { Succeeded = true });
        var sync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, publisher, scheduleRepo, settingsRepo, client, uow, _clinicContext);

        var handler = new UpdateStaffMemberCommandHandler(
            staffRepo, roleRepo, uow, _clinicContext,
            interopPublisher: publisher,
            settingsRepository: settingsRepo,
            scheduleRepository: scheduleRepo,
            auditRepository: auditRepo,
            directorySyncService: sync);

        var result = await handler.Handle(new UpdateStaffMemberCommand(
            docId,
            "Bob",
            "Santos",
            null,
            "Dr.",
            StaffRole.Doctor,
            null,
            "bob@clinic.ph",
            null,
            "0055401",
            null,
            null,
            "Pediatrics",
            true,
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/bob.pdf",
            VerificationContact: "bob@clinic.ph"), CancellationToken.None);

        result.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        (await staffRepo.GetByIdAsync(docId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
    }

    [Fact]
    public async Task StaffLifecycleMutations_WhileFacilityPending_SyncAndReconcileInactiveOrCreatedClinicians()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, roleRepo, auditRepo) = CreateRepos();
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Lifecycle Sync Clinic",
            LicenseToken = "valid-token",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview,
            DefaultApproverName = "Dr. Old Approver"
        });

        var doc1Id = Guid.NewGuid();
        var doc2Id = Guid.NewGuid();
        var doc3Id = Guid.NewGuid();
        var doc4Id = Guid.NewGuid();
        await staffRepo.AddAsync(new StaffMember
        {
            Id = doc1Id,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Anna",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0056001",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey = "verification/prc/anna.pdf",
            VerificationContact = "anna@clinic.ph",
            PublicBio = "Senior Cardiology Consultant",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = doc2Id,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Ben",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0056002",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey = "verification/prc/ben.pdf",
            VerificationContact = "ben@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = doc3Id,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Cara",
            LastName = "Lim",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0056003",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey = "verification/prc/cara.pdf",
            VerificationContact = "cara@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.AwaitingConfirmation,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = doc4Id,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Dan",
            LastName = "Tan",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0056004",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey = "verification/prc/dan.pdf",
            VerificationContact = "dan@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var licenseValidator = Substitute.For<IFacilityLicenseValidator>();
        licenseValidator.Validate(Arg.Any<string?>(), _clinicId, TenantId)
            .Returns(LicenseValidationResult.Success(new FacilityLicensePayload
            {
                FacilityId = _clinicId,
                TenantId = TenantId,
                Limits = new FacilityLimits { MaxStaff = 25 }
            }));

        var publisher = Substitute.For<IInteropPublisher>();
        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload { Succeeded = true });
        var sync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, publisher, scheduleRepo, settingsRepo, client, uow, _clinicContext);

        // 1. Deactivate doc1 via UpdateStaffMemberCommand(IsActive: false) -> excluded from bundle & reset to Unverified
        var updateStaffHandler = new UpdateStaffMemberCommandHandler(
            staffRepo, roleRepo, uow, _clinicContext,
            interopPublisher: publisher,
            settingsRepository: settingsRepo,
            scheduleRepository: scheduleRepo,
            auditRepository: auditRepo,
            directorySyncService: sync);

        await updateStaffHandler.Handle(new UpdateStaffMemberCommand(
            doc1Id, "Anna", "Reyes", null, "Dr.", StaffRole.Doctor, null, "anna@clinic.ph", null, "0056001",
            null, null, "Cardiology", IsActive: false, IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/anna.pdf",
            VerificationContact: "anna@clinic.ph"), CancellationToken.None);

        (await staffRepo.GetByIdAsync(doc1Id))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);
        var lastFacUpdate1 = client.Calls.Last(c => c.RequestType == InteropTypes.FacilityVerificationUpdateRequested)
            .Payload as FacilityVerificationUpdateRequestedPayload;
        lastFacUpdate1!.Practitioners.Select(p => p.ClinicStaffMemberId).Should().NotContain(doc1Id);

        // 2. Deactivate doc2 via DeactivateStaffMemberCommand -> excluded from bundle & reset to Unverified
        var deactivateHandler = new DeactivateStaffMemberCommandHandler(
            staffRepo, uow, _clinicContext, settingsRepository: settingsRepo, directorySyncService: sync);
        (await deactivateHandler.Handle(new DeactivateStaffMemberCommand(doc2Id), CancellationToken.None)).Should().BeTrue();
        (await staffRepo.GetByIdAsync(doc2Id))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);
        var lastFacUpdate2 = client.Calls.Last(c => c.RequestType == InteropTypes.FacilityVerificationUpdateRequested)
            .Payload as FacilityVerificationUpdateRequestedPayload;
        lastFacUpdate2!.Practitioners.Select(p => p.ClinicStaffMemberId).Should().NotContain(doc2Id);

        // 3. Suspend doc3 via SuspendStaffMemberCommand -> excluded from bundle & reset to Unverified
        var suspendHandler = new SuspendStaffMemberCommandHandler(
            staffRepo, uow, _clinicContext, settingsRepository: settingsRepo, directorySyncService: sync);
        var suspendedDto = await suspendHandler.Handle(new SuspendStaffMemberCommand(doc3Id), CancellationToken.None);
        suspendedDto.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);
        (await staffRepo.GetByIdAsync(doc3Id))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);

        // 4. Create an opted-in clinician via CreateStaffMemberCommand -> synced into bundle & marked PendingVerification
        var createHandler = new CreateStaffMemberCommandHandler(
            staffRepo, roleRepo, settingsRepo, licenseValidator, uow, _clinicContext,
            directorySyncService: sync);
        var createdDto = await createHandler.Handle(new CreateStaffMemberCommand(
            "Elena", "Vega", null, "Dr.", StaffRole.Doctor, null, "elena@clinic.ph", null, "0056099",
            null, null, "Dermatology",
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/elena.pdf",
            VerificationContact: "elena@clinic.ph",
            PublicBio: "Board-certified dermatologist."), CancellationToken.None);

        createdDto.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        (await staffRepo.GetByIdAsync(createdDto.Id))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        var lastFacUpdateCreate = client.Calls.Last(c => c.RequestType == InteropTypes.FacilityVerificationUpdateRequested)
            .Payload as FacilityVerificationUpdateRequestedPayload;
        lastFacUpdateCreate!.Practitioners.Select(p => p.ClinicStaffMemberId).Should().Contain(createdDto.Id);

        // 5. Wire-contract clear verification (Challenger 2 Bug 1): passing "" clears PublicBio, VerificationContact, and DefaultApproverName
        // Note: doc4 is active + opted-in with PublicBio & VerificationContact; first set PublicBio on doc4 and clear it with ""
        await updateStaffHandler.Handle(new UpdateStaffMemberCommand(
            doc4Id, "Dan", "Tan", null, "Dr.", StaffRole.Doctor, null, "dan@clinic.ph", null, "0056004",
            null, null, "General Medicine", IsActive: true, IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/dan.pdf",
            VerificationContact: "dan@clinic.ph",
            PublicBio: "Initial Bio"), CancellationToken.None);
        (await staffRepo.GetByIdAsync(doc4Id))!.PublicBio.Should().Be("Initial Bio");

        await updateStaffHandler.Handle(new UpdateStaffMemberCommand(
            doc4Id, "Dan", "Tan", null, "Dr.", StaffRole.Doctor, null, "dan@clinic.ph", null, "0056004",
            null, null, "General Medicine", IsActive: true, IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey: "verification/prc/dan.pdf",
            VerificationContact: "dan@clinic.ph",
            PublicBio: ""), CancellationToken.None);
        (await staffRepo.GetByIdAsync(doc4Id))!.PublicBio.Should().BeNull();

        // Clearing VerificationContact with "" when IsDirectoryOptIn=false clears DB VerificationContact
        await updateStaffHandler.Handle(new UpdateStaffMemberCommand(
            doc4Id, "Dan", "Tan", null, "Dr.", StaffRole.Doctor, null, "dan@clinic.ph", null, "0056004",
            null, null, "General Medicine", IsActive: true, IsDirectoryOptIn: false,
            VerificationContact: ""), CancellationToken.None);
        (await staffRepo.GetByIdAsync(doc4Id))!.VerificationContact.Should().BeNull();

        // Removing suspended doc3 via RemoveStaffMemberCommand while pending also triggers facility pending sync
        var callsBeforeRemove = client.Calls.Count(c => c.RequestType == InteropTypes.FacilityVerificationUpdateRequested);
        await staffRepo.GetByIdAsync(doc3Id);
        // Set doc3 IsDirectoryOptIn = true (still suspended) and remove
        var doc3Entity = await staffRepo.GetByIdAsync(doc3Id);
        doc3Entity!.PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification;
        await uow.SaveChangesAsync();
        var removeHandler = new RemoveStaffMemberCommandHandler(
            staffRepo, uow, _clinicContext, settingsRepository: settingsRepo, directorySyncService: sync);
        (await removeHandler.Handle(new RemoveStaffMemberCommand(doc3Id), CancellationToken.None)).Should().BeTrue();
        client.Calls.Count(c => c.RequestType == InteropTypes.FacilityVerificationUpdateRequested)
            .Should().Be(callsBeforeRemove + 1);

        // UpdateClinicSettingsCommand(DefaultApproverName: "") clears DefaultApproverName to null
        var updateSettingsHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, directorySyncService: sync);
        var updatedSettings = await updateSettingsHandler.Handle(
            new UpdateClinicSettingsCommand(DefaultApproverName: ""), CancellationToken.None);
        updatedSettings.DefaultApproverName.Should().BeNull();
        (await settingsRepo.Query().FirstAsync()).DefaultApproverName.Should().BeNull();
    }

    [Fact]
    public async Task WithdrawActivateAndReactivate_WhileFacilityPendingReview_SyncPendingFacilityAndReconcileStatuses()
    {
        var (_, uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _, _, auditRepo) = CreateRepos();
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Pending Lifecycle Clinic",
            LicenseToken = "valid-token",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        });

        var withdrawDocId = Guid.NewGuid();
        var activateDocId = Guid.NewGuid();
        var reactivateDocId = Guid.NewGuid();
        var futureExpiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2));

        await staffRepo.AddAsync(new StaffMember
        {
            Id = withdrawDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Wilma",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0071001",
            PrcExpiryDate = futureExpiry,
            PrcEvidenceObjectKey = "verification/prc/wilma.pdf",
            VerificationContact = "wilma@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            Status = StaffAccountStatus.Active,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = activateDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Aldrin",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0071002",
            PrcExpiryDate = futureExpiry,
            PrcEvidenceObjectKey = "verification/prc/aldrin.pdf",
            VerificationContact = "aldrin@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Unverified,
            Status = StaffAccountStatus.Suspended,
            IsActive = false
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = reactivateDocId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Rina",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0071003",
            PrcExpiryDate = futureExpiry,
            PrcEvidenceObjectKey = "verification/prc/rina.pdf",
            VerificationContact = "rina@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Unverified,
            Status = StaffAccountStatus.Suspended,
            IsActive = false
        });
        await uow.SaveChangesAsync();

        var licenseValidator = Substitute.For<IFacilityLicenseValidator>();
        licenseValidator.Validate(Arg.Any<string?>(), _clinicId, TenantId)
            .Returns(LicenseValidationResult.Success(new FacilityLicensePayload
            {
                FacilityId = _clinicId,
                TenantId = TenantId,
                Limits = new FacilityLimits { MaxStaff = 25 }
            }));

        var publisher = Substitute.For<IInteropPublisher>();
        var client = new StubInteropRequestClient(_ => new VerificationUpdateRespondedPayload { Succeeded = true });
        var sync = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, publisher, scheduleRepo, settingsRepo, client, uow, _clinicContext);

        // 1. WithdrawPractitionerVerificationCommand while PendingReview -> syncs facility update excluding withdrawn doctor
        var withdrawHandler = new WithdrawPractitionerVerificationCommandHandler(
            staffRepo, _clinicContext, uow, settingsRepo, sync, auditRepo);
        var withdrawnDto = await withdrawHandler.Handle(
            new WithdrawPractitionerVerificationCommand(withdrawDocId, "Stepping back"), CancellationToken.None);

        withdrawnDto.IsDirectoryOptIn.Should().BeFalse();
        withdrawnDto.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);
        client.Calls.Should().ContainSingle(c => c.RequestType == InteropTypes.FacilityVerificationUpdateRequested);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls[0].Payload).Practitioners
            .Select(p => p.ClinicStaffMemberId).Should().NotContain(withdrawDocId);

        // 2. ActivateStaffMemberCommand on opted-in clinician while PendingReview -> syncs facility update & marks PendingVerification
        var activateHandler = new ActivateStaffMemberCommandHandler(
            staffRepo, settingsRepo, licenseValidator, uow, _clinicContext, directorySyncService: sync);
        var activatedDto = await activateHandler.Handle(new ActivateStaffMemberCommand(activateDocId), CancellationToken.None);

        activatedDto.IsActive.Should().BeTrue();
        activatedDto.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        (await staffRepo.GetByIdAsync(activateDocId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        client.Calls.Should().HaveCount(2);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls[1].Payload).Practitioners
            .Select(p => p.ClinicStaffMemberId).Should().Contain(activateDocId);

        // 3. ReactivateStaffMemberCommand on opted-in clinician while PendingReview -> syncs facility update & marks PendingVerification
        var reactivateHandler = new ReactivateStaffMemberCommandHandler(
            staffRepo, settingsRepo, licenseValidator, uow, _clinicContext, directorySyncService: sync);
        var reactivatedDto = await reactivateHandler.Handle(new ReactivateStaffMemberCommand(reactivateDocId), CancellationToken.None);

        reactivatedDto.IsActive.Should().BeTrue();
        reactivatedDto.Status.Should().Be(StaffAccountStatus.Active);
        reactivatedDto.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        (await staffRepo.GetByIdAsync(reactivateDocId))!.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        client.Calls.Should().HaveCount(3);
        ((FacilityVerificationUpdateRequestedPayload)client.Calls[2].Payload).Practitioners
            .Select(p => p.ClinicStaffMemberId).Should().Contain(reactivateDocId);

        // 4. SkipPendingVerificationSync = true suppresses sync on all 3 commands
        var skipDeactivateHandler = new DeactivateStaffMemberCommandHandler(
            staffRepo, uow, _clinicContext, settingsRepository: settingsRepo, directorySyncService: sync);
        await skipDeactivateHandler.Handle(new DeactivateStaffMemberCommand(activateDocId, SkipPendingVerificationSync: true), CancellationToken.None);
        await skipDeactivateHandler.Handle(new DeactivateStaffMemberCommand(reactivateDocId, SkipPendingVerificationSync: true), CancellationToken.None);

        var callsBeforeSkip = client.Calls.Count;
        await activateHandler.Handle(new ActivateStaffMemberCommand(activateDocId, SkipPendingVerificationSync: true), CancellationToken.None);
        await reactivateHandler.Handle(new ReactivateStaffMemberCommand(reactivateDocId, SkipPendingVerificationSync: true), CancellationToken.None);
        await withdrawHandler.Handle(new WithdrawPractitionerVerificationCommand(activateDocId, "Skip sync", SkipPendingVerificationSync: true), CancellationToken.None);
        client.Calls.Should().HaveCount(callsBeforeSkip);
    }

    #endregion
}
