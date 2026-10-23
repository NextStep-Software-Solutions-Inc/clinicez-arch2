using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicPublishingGovernanceTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-publishing-test";

    public ClinicPublishingGovernanceTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public async Task ReadinessCheck_WhenMissingOperatingHours_ReturnsNotReady()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);

        // Add doctor with PRC
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            FirstName = "Juan",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-12345",
            IsActive = true
        }, CancellationToken.None);

        // Add active service
        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _testClinicId,
            Code = "GEN-CONSULT",
            Name = "General Consultation",
            Category = "Consultation",
            StandardPrice = 400.00m,
            IsActive = true
        }, CancellationToken.None);

        // Settings without OperatingHours
        await settingsRepo.AddAsync(new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Test Clinic",
            OperatingHours = ""
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetClinicPublishingReadinessQueryHandler(settingsRepo, staffRepo, servicesRepo, _clinicContext);
        var readiness = await handler.Handle(new GetClinicPublishingReadinessQuery(), CancellationToken.None);

        readiness.IsReady.Should().BeFalse();
        readiness.Checks.HasOperatingHours.Should().BeFalse();
        readiness.Checks.HasLicensedDoctors.Should().BeTrue();
        readiness.Checks.HasActiveServices.Should().BeTrue();
    }

    [Fact]
    public async Task ReadinessCheck_WhenAllConditionsMet_ReturnsIsReadyTrue()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            FirstName = "Maria",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-998877",
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _testClinicId,
            Code = "WELLNESS",
            Name = "Comprehensive Wellness Check",
            Category = "Consultation",
            StandardPrice = 600.00m,
            IsActive = true
        }, CancellationToken.None);

        await settingsRepo.AddAsync(new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Ready Clinic",
            OperatingHours = "Mon-Fri 8:00 AM - 5:00 PM"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetClinicPublishingReadinessQueryHandler(settingsRepo, staffRepo, servicesRepo, _clinicContext);
        var readiness = await handler.Handle(new GetClinicPublishingReadinessQuery(), CancellationToken.None);

        readiness.IsReady.Should().BeTrue();
        readiness.Checks.HasOperatingHours.Should().BeTrue();
        readiness.Checks.HasLicensedDoctors.Should().BeTrue();
        readiness.Checks.HasActiveServices.Should().BeTrue();
    }

    [Fact]
    public async Task PublishClinic_WhenNotReady_ThrowsInvalidOperationException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        await settingsRepo.AddAsync(new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Unready Clinic",
            OperatingHours = "" // Missing operating hours
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*readiness checks failed*");
    }

    [Fact]
    public async Task PublishClinic_WhenReady_PublishesAndEnqueuesOutboxEvent()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            FirstName = "Roberto",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-554433",
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _testClinicId,
            Code = "MED-EXAM",
            Name = "Annual Medical Examination",
            Category = "Consultation",
            StandardPrice = 500.00m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Cruz Medical Clinic",
            OperatingHours = "Mon-Sat 9:00 AM - 6:00 PM",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        var result = await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeTrue();
        settings.IsDirectoryPublished.Should().BeTrue();

        // Verify outbox message enqueue call
        interopPublisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Is<Party>(p => p.FacilityId == _testClinicId.ToString() && p.FacilityType == FacilityType.Clinic),
            Arg.Is<Party>(p => p.Kind == PartyKind.ControlPlane && p.Service == InteropServices.Patient),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e => e.IsPublic == true && e.Providers != null && e.Providers.Count == 1));
    }

    [Fact]
    public async Task ToggleBookingPause_TogglesAndEnqueuesOutboxEvent()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Capacity Clinic",
            IsOnlineBookingPaused = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ToggleOnlineBookingPauseCommandHandler(
            settingsRepo, _clinicContext, uow, interopPublisher);

        var result = await handler.Handle(new ToggleOnlineBookingPauseCommand(true), CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsPaused.Should().BeTrue();
        settings.IsOnlineBookingPaused.Should().BeTrue();

        interopPublisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Is<Party>(p => p.FacilityId == _testClinicId.ToString()),
            Arg.Is<Party>(p => p.Service == InteropServices.Patient),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e => e.IsBookingPaused == true));
    }
}
