using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Application.Features.Settings.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.DirectoryVerification;

public sealed class DirectoryVerificationEnrichment217Tests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private const string TenantId = "tenant-dir-217";

    public DirectoryVerificationEnrichment217Tests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.StaffName.Returns("Dr. Clara Reyes");
        _clinicContext.StaffRole.Returns("Admin");
    }

    [Fact]
    public async Task UpdateClinicSettings_SetsPreservesAndClearsDohLtoExpiryDate_AndExposesInQueries()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);

        var expiry = new DateOnly(2028, 6, 30);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // 1. Set DohLtoExpiryDate
        var createdDto = await updateHandler.Handle(
            new UpdateClinicSettingsCommand(ClinicName: "Care Clinic", DohLtoExpiryDate: expiry),
            CancellationToken.None);
        createdDto.DohLtoExpiryDate.Should().Be(expiry);

        // 2. Preserve when DohLtoExpiryDate is null and ClearDohLtoExpiryDate is false
        var preservedDto = await updateHandler.Handle(
            new UpdateClinicSettingsCommand(QueuePrefix: "C"),
            CancellationToken.None);
        preservedDto.DohLtoExpiryDate.Should().Be(expiry);

        // 3. Verify GetClinicSettingsQuery and GetClinicPublishingReadinessQuery expose DohLtoExpiryDate
        var getSettings = await new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow).Handle(
            new GetClinicSettingsQuery(), CancellationToken.None);
        getSettings.DohLtoExpiryDate.Should().Be(expiry);

        var readiness = await new GetClinicPublishingReadinessQueryHandler(settingsRepo, staffRepo, servicesRepo, _clinicContext)
            .Handle(new GetClinicPublishingReadinessQuery(), CancellationToken.None);
        readiness.DohLtoExpiryDate.Should().Be(expiry);

        // 4. Clear when ClearDohLtoExpiryDate is true
        var clearedDto = await updateHandler.Handle(
            new UpdateClinicSettingsCommand(ClearDohLtoExpiryDate: true),
            CancellationToken.None);
        clearedDto.DohLtoExpiryDate.Should().BeNull();
    }

    [Fact]
    public async Task SnapshotAndPublish_Populate217MetadataAndResolveSubmitterNameViaStaffLookupFallback()
    {
        var noNameContext = Substitute.For<IClinicContext>();
        noNameContext.ClinicId.Returns(_clinicId);
        noNameContext.TenantId.Returns(TenantId);
        noNameContext.StaffId.Returns(_staffId);
        noNameContext.StaffName.Returns((string?)null); // simulate missing name claim

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(noNameContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        // Submitter is an Admin (excluded from LoadCliniciansAsync, must be resolved via _staffRepo lookup)
        await staffRepo.AddAsync(new StaffMember
        {
            Id = _staffId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Elena",
            LastName = "Mendoza",
            Title = "Ms.",
            Role = StaffRole.Admin,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0112233",
            IsDirectoryOptIn = true,
            IsActive = true
        });
        await servicesRepo.AddAsync(new ServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "CON-01",
            Name = "Consultation",
            Category = "Medical",
            StandardPrice = 500m,
            IsActive = true
        });

        var expiry = new DateOnly(2027, 12, 31);
        var settings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "PhilHealth Branch Clinic",
            OperatingHours = "Mon-Fri 8AM-5PM",
            LetterheadDohLto = "LTO-2026-001",
            DohLtoExpiryDate = expiry,
            IsWorkspaceEligible = true,
            IsPhilHealthOverridden = false,
            IsBranchPhilHealthAccredited = true,
            BranchPhilHealthAccreditationNumber = "PHIC-BR-9001",
            EnableTeleconsultation = true
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var syncService = new ClinicDirectorySyncService(staffRepo, servicesRepo, publisher, settingsRepo: settingsRepo, clinicContext: noNameContext);
        var publishHandler = new PublishClinicToDirectoryCommandHandler(settingsRepo, staffRepo, servicesRepo, noNameContext, uow, publisher, syncService);

        await publishHandler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        publisher.Received(1).Enqueue(
            InteropTypes.FacilityVerificationRequested,
            Arg.Any<Party>(),
            Party.Portal,
            _clinicId,
            Arg.Is<FacilityVerificationRequestedPayload>(p =>
                p.DohLtoExpiryDate == expiry &&
                p.PhilHealthAccreditationNumber == "PHIC-BR-9001" &&
                p.IsPhilHealthAccredited &&
                p.SupportsInPerson &&
                p.SupportsTeleconsult &&
                p.SubmittedByClinicUserId == _staffId.ToString() &&
                p.SubmittedByDisplayName == "Ms. Elena Mendoza"));

        // Also test overridden clinic accreditation precedence over branch baseline
        settings.IsPhilHealthOverridden = true;
        settings.AccreditationNumber = "PHIC-OV-777";
        settings.IsPhilHealthConfigured = true;
        settings.EnableTeleconsultation = false;
        var overridePayload = ClinicDirectorySnapshotBuilder.BuildVerificationRequestedPayload(
            settings, [], [], [], "Resubmission", _staffId.ToString(), "Override Admin", DateTime.UtcNow);
        overridePayload.PhilHealthAccreditationNumber.Should().Be("PHIC-OV-777");
        overridePayload.IsPhilHealthAccredited.Should().BeTrue();
        overridePayload.SupportsInPerson.Should().BeTrue();
        overridePayload.SupportsTeleconsult.Should().BeFalse();
    }

    [Fact]
    public async Task PractitionerVerificationHelperAndSyncService_ResolveSubmittedByDisplayName()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var docId = Guid.NewGuid();
        var otherSubmitterId = Guid.NewGuid();

        var doctor = new StaffMember
        {
            Id = docId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Rafael",
            LastName = "Torres",
            Title = "Dr.",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0554433",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "tenants/t/clinics/c/prc.pdf",
            VerificationContact = "torres@clinic.ph",
            IsDirectoryOptIn = true,
            IsActive = true
        };
        var admin = new StaffMember
        {
            Id = otherSubmitterId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Lorna",
            LastName = "Villanueva",
            Role = StaffRole.Admin,
            IsActive = true
        };
        await staffRepo.AddAsync(doctor);
        await staffRepo.AddAsync(admin);
        await uow.SaveChangesAsync();

        // Case 1: ClinicContext.StaffName present -> used directly
        var syncService = new ClinicDirectorySyncService(staffRepo, servicesRepo, publisher, settingsRepo: settingsRepo);
        await PractitionerVerificationSubmissionHelper.EnqueueVerificationAndAuditAsync(
            doctor, "Initial", DateTime.UtcNow, _clinicContext, syncService, publisher, settingsRepo, null, null, CancellationToken.None, staffRepo);

        publisher.Received(1).Enqueue(
            InteropTypes.PractitionerVerificationRequested,
            Arg.Any<Party>(),
            Party.Portal,
            docId,
            Arg.Is<PractitionerVerificationRequestedPayload>(p => p.SubmittedByDisplayName == "Dr. Clara Reyes"));

        publisher.ClearReceivedCalls();

        // Case 2: Self-submit with null StaffName -> resolved from target StaffMember
        var selfNoNameCtx = Substitute.For<IClinicContext>();
        selfNoNameCtx.ClinicId.Returns(_clinicId);
        selfNoNameCtx.TenantId.Returns(TenantId);
        selfNoNameCtx.StaffId.Returns(docId);
        selfNoNameCtx.StaffName.Returns((string?)null);

        await PractitionerVerificationSubmissionHelper.EnqueueVerificationAndAuditAsync(
            doctor, "Initial", DateTime.UtcNow, selfNoNameCtx, null, publisher, settingsRepo, null, null, CancellationToken.None, staffRepo);

        publisher.Received(1).Enqueue(
            InteropTypes.PractitionerVerificationRequested,
            Arg.Any<Party>(),
            Party.Portal,
            docId,
            Arg.Is<PractitionerVerificationRequestedPayload>(p => p.SubmittedByDisplayName == "Dr. Rafael Torres"));

        publisher.ClearReceivedCalls();

        // Case 3: Another staff member submits with null StaffName -> resolved via staffRepo lookup
        var adminNoNameCtx = Substitute.For<IClinicContext>();
        adminNoNameCtx.ClinicId.Returns(_clinicId);
        adminNoNameCtx.TenantId.Returns(TenantId);
        adminNoNameCtx.StaffId.Returns(otherSubmitterId);
        adminNoNameCtx.StaffName.Returns((string?)null);

        await syncService.EnqueuePractitionerVerificationRequestAsync(
            doctor, "Initial", otherSubmitterId.ToString(), DateTime.UtcNow, null, CancellationToken.None);

        publisher.Received(1).Enqueue(
            InteropTypes.PractitionerVerificationRequested,
            Arg.Any<Party>(),
            Party.Portal,
            docId,
            Arg.Is<PractitionerVerificationRequestedPayload>(p => p.SubmittedByDisplayName == "Lorna Villanueva"));
    }

    [Fact]
    public void SplitLetterheadContact_RoutesPureAndMixedEmailsToContactEmail_PreservingPhoneStrings()
    {
        var pureEmailSettings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Rizal Care Clinic",
            LetterheadContact = "wave.ambray@nextstep-software.com"
        };
        var emailOnlyReq = ClinicDirectorySnapshotBuilder.BuildVerificationRequestedPayload(
            pureEmailSettings, [], [], [], "Initial", "staff-1", "Dr. Rizal", DateTime.UtcNow);
        emailOnlyReq.ContactNumber.Should().BeNull();
        emailOnlyReq.ContactEmail.Should().Be("wave.ambray@nextstep-software.com");

        var mixedSettings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Rizal Care Clinic",
            LetterheadContact = "Tel: (02) 8876-5432 | wave.ambray@nextstep-software.com"
        };
        var mixedUpdate = ClinicDirectorySnapshotBuilder.BuildFacilityUpdatePayload(
            mixedSettings, [], [], [], "staff-1", "Dr. Rizal", DateTime.UtcNow);
        mixedUpdate.ContactNumber.Should().Be("Tel: (02) 8876-5432");
        mixedUpdate.ContactEmail.Should().Be("wave.ambray@nextstep-software.com");

        var phoneOnlySettings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Rizal Care Clinic",
            LetterheadContact = "Tel: (02) 8876-5432 • Mobile: +63 917 123 4567"
        };
        var phoneOnlyReq = ClinicDirectorySnapshotBuilder.BuildVerificationRequestedPayload(
            phoneOnlySettings, [], [], [], "Initial", "staff-1", "Dr. Rizal", DateTime.UtcNow);
        phoneOnlyReq.ContactNumber.Should().Be("Tel: (02) 8876-5432 • Mobile: +63 917 123 4567");
        phoneOnlyReq.ContactEmail.Should().BeNull();
    }
}
