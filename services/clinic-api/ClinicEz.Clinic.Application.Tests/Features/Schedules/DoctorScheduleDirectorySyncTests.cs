using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Schedules.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Schedules;

public sealed class DoctorScheduleDirectorySyncTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private const string TenantId = "tenant-issue-243";
    private readonly IClinicContext _clinicContext;

    public DoctorScheduleDirectorySyncTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.StaffName.Returns("Admin User");
        _clinicContext.StaffRole.Returns("Admin");
    }

    private (
        IUnitOfWork Uow,
        IRepository<FacilitySettings> SettingsRepo,
        IRepository<StaffMember> StaffRepo,
        IRepository<ServiceItem> ServicesRepo,
        IRepository<DoctorScheduleTemplate> ScheduleRepo,
        IRepository<DoctorBreakTime> BreakRepo) CreateRepos()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        return (
            uow,
            TestDbHelper.CreateRepository<FacilitySettings>(db, sieve),
            TestDbHelper.CreateRepository<StaffMember>(db, sieve),
            TestDbHelper.CreateRepository<ServiceItem>(db, sieve),
            TestDbHelper.CreateRepository<DoctorScheduleTemplate>(db, sieve),
            TestDbHelper.CreateRepository<DoctorBreakTime>(db, sieve));
    }

    private FacilitySettings CreateSettings(
        PlatformVerificationStatus status = PlatformVerificationStatus.Verified,
        bool isPublished = true) => new()
    {
        TenantId = TenantId,
        ClinicId = _clinicId,
        ClinicName = "Nextstep OPD",
        OperatingHours = "Mon-Fri 08:00-17:00",
        IsWorkspaceEligible = true,
        PlatformVerificationStatus = status,
        IsDirectoryPublished = isPublished
    };

    private StaffMember CreateClinician(
        Guid doctorId,
        bool isActive = true,
        bool isOptIn = true,
        StaffRole role = StaffRole.Doctor,
        PractitionerVerificationLevel verificationStatus = PractitionerVerificationLevel.Verified) => new()
    {
        Id = doctorId,
        TenantId = TenantId,
        ClinicId = _clinicId,
        FirstName = "Lovely Jean",
        LastName = "Maureal",
        Title = "Dr.",
        Role = role,
        Specialty = "General Practice",
        PrcLicenseNumber = "PRC-0123456",
        PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
        PrcEvidenceObjectKey = "tenants/t/clinics/c/prc.pdf",
        VerificationContact = "dr.maureal@nextstep.ph",
        IsActive = isActive,
        IsDirectoryOptIn = isOptIn,
        PublicVerificationStatus = verificationStatus
    };

    [Fact]
    public async Task UpsertTemplate_VerifiedAndPublishedClinic_EnqueuesFacilityDirectoryUpdatedWithUpdatedAvailabilitiesAndSaves()
    {
        var (uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, breakRepo) = CreateRepos();
        var doctorId = Guid.NewGuid();
        var settings = CreateSettings();
        await settingsRepo.AddAsync(settings);
        await staffRepo.AddAsync(CreateClinician(doctorId));
        await uow.SaveChangesAsync();

        var publishedEvents = new List<FacilityCreatedEvent>();
        var interopPublisher = Substitute.For<IInteropPublisher>();
        interopPublisher
            .When(p => p.Enqueue(
                InteropTypes.FacilityDirectoryUpdated,
                Arg.Any<Party>(),
                Arg.Is<Party>(to => to.Kind == PartyKind.ControlPlane && to.Service == InteropServices.Patient),
                _clinicId,
                Arg.Any<FacilityCreatedEvent>()))
            .Do(ci => publishedEvents.Add(ci.ArgAt<FacilityCreatedEvent>(4)));

        var syncService = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, interopPublisher, scheduleRepo, settingsRepo, unitOfWork: uow, clinicContext: _clinicContext);

        var spyUow = new CountingUnitOfWork(uow);
        var handler = new UpsertDoctorScheduleTemplateCommandHandler(
            scheduleRepo, breakRepo, staffRepo, spyUow, _clinicContext, settingsRepo, syncService);

        // 1. Create Monday template
        await handler.Handle(new UpsertDoctorScheduleTemplateCommand(
            doctorId,
            "Dr. Lovely Jean Maureal",
            DayOfWeek.Monday,
            new TimeOnly(9, 0),
            new TimeOnly(17, 0),
            SlotDurationMinutes: 30,
            IsActive: true), CancellationToken.None);

        publishedEvents.Should().HaveCount(1);
        spyUow.SaveCount.Should().Be(2); // 1 for template save + 1 for outbox commit
        var createdProvider = publishedEvents[0].Providers!.Should().ContainSingle(p => p.Id == doctorId).Subject;
        createdProvider.Availabilities.Should().ContainSingle(a =>
            a.DayOfWeek == DayOfWeek.Monday &&
            a.StartTime == "09:00" &&
            a.EndTime == "17:00" &&
            a.SlotDurationMinutes == 30);

        // 2. Edit Monday template
        await handler.Handle(new UpsertDoctorScheduleTemplateCommand(
            doctorId,
            "Dr. Lovely Jean Maureal",
            DayOfWeek.Monday,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0),
            SlotDurationMinutes: 30,
            IsActive: true), CancellationToken.None);

        publishedEvents.Should().HaveCount(2);
        spyUow.SaveCount.Should().Be(4);
        var editedProvider = publishedEvents[1].Providers!.Should().ContainSingle(p => p.Id == doctorId).Subject;
        editedProvider.Availabilities.Should().ContainSingle(a =>
            a.DayOfWeek == DayOfWeek.Monday &&
            a.StartTime == "08:00" &&
            a.EndTime == "16:00");

        // 3. Mark Monday Off Duty (IsActive = false)
        await handler.Handle(new UpsertDoctorScheduleTemplateCommand(
            doctorId,
            "Dr. Lovely Jean Maureal",
            DayOfWeek.Monday,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0),
            SlotDurationMinutes: 30,
            IsActive: false), CancellationToken.None);

        publishedEvents.Should().HaveCount(3);
        spyUow.SaveCount.Should().Be(6);
        var offDutyProvider = publishedEvents[2].Providers!.Should().ContainSingle(p => p.Id == doctorId).Subject;
        offDutyProvider.Availabilities.Should().BeEmpty();
    }

    [Fact]
    public async Task DeleteTemplate_VerifiedAndPublishedClinic_EnqueuesFacilityDirectoryUpdatedRemovingDeletedWindowAndSaves()
    {
        var (uow, settingsRepo, staffRepo, servicesRepo, scheduleRepo, _) = CreateRepos();
        var doctorId = Guid.NewGuid();
        var mondayId = Guid.NewGuid();
        var wednesdayId = Guid.NewGuid();

        await settingsRepo.AddAsync(CreateSettings());
        await staffRepo.AddAsync(CreateClinician(doctorId));
        await scheduleRepo.AddAsync(new DoctorScheduleTemplate
        {
            Id = mondayId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            DoctorId = doctorId,
            DoctorName = "Dr. Lovely Jean Maureal",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(17, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        });
        await scheduleRepo.AddAsync(new DoctorScheduleTemplate
        {
            Id = wednesdayId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            DoctorId = doctorId,
            DoctorName = "Dr. Lovely Jean Maureal",
            DayOfWeek = DayOfWeek.Wednesday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(12, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var publishedEvents = new List<FacilityCreatedEvent>();
        var interopPublisher = Substitute.For<IInteropPublisher>();
        interopPublisher
            .When(p => p.Enqueue(
                InteropTypes.FacilityDirectoryUpdated,
                Arg.Any<Party>(),
                Arg.Is<Party>(to => to.Kind == PartyKind.ControlPlane && to.Service == InteropServices.Patient),
                _clinicId,
                Arg.Any<FacilityCreatedEvent>()))
            .Do(ci => publishedEvents.Add(ci.ArgAt<FacilityCreatedEvent>(4)));

        var syncService = new ClinicDirectorySyncService(
            staffRepo, servicesRepo, interopPublisher, scheduleRepo, settingsRepo, unitOfWork: uow, clinicContext: _clinicContext);

        var spyUow = new CountingUnitOfWork(uow);
        var handler = new DeleteDoctorScheduleTemplateCommandHandler(
            scheduleRepo, spyUow, _clinicContext, staffRepo, settingsRepo, syncService);

        var deleted = await handler.Handle(new DeleteDoctorScheduleTemplateCommand(doctorId, mondayId), CancellationToken.None);

        deleted.Should().BeTrue();
        spyUow.SaveCount.Should().Be(2); // 1 for template soft-delete + 1 for outbox commit
        publishedEvents.Should().HaveCount(1);
        var provider = publishedEvents[0].Providers!.Should().ContainSingle(p => p.Id == doctorId).Subject;
        provider.Availabilities.Should().ContainSingle(a => a.DayOfWeek == DayOfWeek.Wednesday);
        provider.Availabilities.Should().NotContain(a => a.DayOfWeek == DayOfWeek.Monday);
    }

    [Theory]
    [InlineData(PlatformVerificationStatus.Verified, false, true, true)]
    [InlineData(PlatformVerificationStatus.Unverified, true, true, true)]
    [InlineData(PlatformVerificationStatus.Rejected, true, true, true)]
    [InlineData(PlatformVerificationStatus.Suspended, true, true, true)]
    [InlineData(PlatformVerificationStatus.Verified, true, false, true)]
    [InlineData(PlatformVerificationStatus.Verified, true, true, false)]
    public async Task UpsertAndDelete_WhenClinicUnpublishedOrUnverifiedOrClinicianIneligible_DoesNotEnqueueDirectoryUpdate(
        PlatformVerificationStatus clinicStatus,
        bool isPublished,
        bool clinicianOptIn,
        bool clinicianActive)
    {
        var (uow, settingsRepo, staffRepo, _, scheduleRepo, breakRepo) = CreateRepos();
        var doctorId = Guid.NewGuid();
        await settingsRepo.AddAsync(CreateSettings(clinicStatus, isPublished));
        await staffRepo.AddAsync(CreateClinician(doctorId, isActive: clinicianActive, isOptIn: clinicianOptIn));
        await uow.SaveChangesAsync();

        var syncService = Substitute.For<IClinicDirectorySyncService>();
        var upsertHandler = new UpsertDoctorScheduleTemplateCommandHandler(
            scheduleRepo, breakRepo, staffRepo, uow, _clinicContext, settingsRepo, syncService);
        var deleteHandler = new DeleteDoctorScheduleTemplateCommandHandler(
            scheduleRepo, uow, _clinicContext, staffRepo, settingsRepo, syncService);

        var created = await upsertHandler.Handle(new UpsertDoctorScheduleTemplateCommand(
            doctorId,
            "Dr. Lovely Jean Maureal",
            DayOfWeek.Tuesday,
            new TimeOnly(9, 0),
            new TimeOnly(12, 0)), CancellationToken.None);

        await deleteHandler.Handle(new DeleteDoctorScheduleTemplateCommand(doctorId, created.Id), CancellationToken.None);

        await syncService.DidNotReceive().EnqueueDirectoryUpdateAsync(Arg.Any<FacilitySettings>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PendingPractitionerOnVerifiedAndPublishedClinic_RespectsSkipPendingFlagWhileStillSyncingPublishedDirectory()
    {
        var (uow, settingsRepo, staffRepo, _, scheduleRepo, breakRepo) = CreateRepos();
        var doctorId = Guid.NewGuid();
        var settings = CreateSettings(PlatformVerificationStatus.Verified, isPublished: true);
        await settingsRepo.AddAsync(settings);
        await staffRepo.AddAsync(CreateClinician(doctorId, verificationStatus: PractitionerVerificationLevel.PendingVerification));
        await uow.SaveChangesAsync();

        var syncService = Substitute.For<IClinicDirectorySyncService>();
        var upsertHandler = new UpsertDoctorScheduleTemplateCommandHandler(
            scheduleRepo, breakRepo, staffRepo, uow, _clinicContext, settingsRepo, syncService);

        await upsertHandler.Handle(new UpsertDoctorScheduleTemplateCommand(
            doctorId,
            "Dr. Lovely Jean Maureal",
            DayOfWeek.Thursday,
            new TimeOnly(9, 0),
            new TimeOnly(12, 0),
            SkipPendingVerificationSync: false), CancellationToken.None);

        await syncService.Received(1).SyncPendingPractitionerVerificationAsync(
            doctorId, false, _staffId.ToString(), "Admin User", Arg.Any<CancellationToken>());
        await syncService.Received(1).EnqueueDirectoryUpdateAsync(settings, Arg.Any<CancellationToken>());

        syncService.ClearReceivedCalls();

        await upsertHandler.Handle(new UpsertDoctorScheduleTemplateCommand(
            doctorId,
            "Dr. Lovely Jean Maureal",
            DayOfWeek.Friday,
            new TimeOnly(9, 0),
            new TimeOnly(12, 0),
            SkipPendingVerificationSync: true), CancellationToken.None);

        await syncService.DidNotReceive().SyncPendingPractitionerVerificationAsync(
            Arg.Any<Guid>(), Arg.Any<bool>(), Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>());
        await syncService.Received(1).EnqueueDirectoryUpdateAsync(settings, Arg.Any<CancellationToken>());
    }

    private sealed class CountingUnitOfWork(IUnitOfWork inner) : IUnitOfWork
    {
        public int SaveCount { get; private set; }

        public IProductRepository ProductRepository => inner.ProductRepository;

        public async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCount++;
            return await inner.SaveChangesAsync(cancellationToken);
        }

        public Task ExecuteInTransactionAsync(Func<CancellationToken, Task> action, CancellationToken cancellationToken = default) =>
            inner.ExecuteInTransactionAsync(action, cancellationToken);

        public Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken cancellationToken = default) =>
            inner.ExecuteInTransactionAsync(action, cancellationToken);
    }
}
