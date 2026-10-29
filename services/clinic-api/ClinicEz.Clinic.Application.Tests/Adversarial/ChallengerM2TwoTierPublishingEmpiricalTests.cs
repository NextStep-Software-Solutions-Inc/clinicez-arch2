using System;
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

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone 2:
/// Clinic API Persistence & Tier-2 Governance Enforcement (Issue #72).
/// 
/// Stress-tests:
/// 1. Pre-flight readiness gating against workspace ineligibility (IsWorkspaceEligible == false).
/// 2. Error message aggregation across multiple simultaneous readiness failures.
/// 3. Unconditional unpublishing autonomy regardless of eligibility or operational completeness.
/// 4. Immutability of IsWorkspaceEligible against clinic staff mutation via UpdateClinicSettingsCommand.
/// 5. Propagation of IsWorkspaceEligible in DTO mappings (GetClinicSettingsQuery, GetClinicPublishingReadinessQuery).
/// 6. Idempotent consecutive publishing and unpublishing cycles.
/// </summary>
public class ChallengerM2TwoTierPublishingEmpiricalTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-two-tier-stress";

    public ChallengerM2TwoTierPublishingEmpiricalTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    private async Task SeedFullOperationalReadinessAsync(
        IRepository<StaffMember> staffRepo,
        IRepository<ServiceItem> servicesRepo,
        IUnitOfWork uow)
    {
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            FirstName = "Maria Clara",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-MED-998811",
            Specialty = "Internal Medicine",
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ServiceItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            Code = "MED-001",
            Name = "Comprehensive Health Evaluation",
            Category = "Consultation",
            StandardPrice = 1200.00m,
            IsActive = true
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Publish_WhenWorkspaceIneligible_ThrowsInvalidOperationException_AndBlocksOutbox()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        await SeedFullOperationalReadinessAsync(staffRepo, servicesRepo, uow);

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Manila Health Hub",
            OperatingHours = "Mon-Fri 8:00 AM - 5:00 PM",
            LetterheadAddress = "Suite 401, Taft Avenue, Manila",
            LetterheadContact = "+63 2 8123 4567",
            IsWorkspaceEligible = false, // Ineligible at Tier 1
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("*readiness checks failed*");
        ex.WithMessage("*Facility has not been granted workspace eligibility for patient app directory publishing in Portal*");

        // Verify entity state was not mutated
        settings.IsDirectoryPublished.Should().BeFalse();

        // Verify outbox was never written to
        interopPublisher.DidNotReceiveWithAnyArgs().Enqueue<FacilityCreatedEvent>(
            default!, default!, default!, default, default!);
    }

    [Fact]
    public async Task Publish_WhenAllReadinessChecksFail_AggregatesAllMissingChecksInException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Zero doctors, zero services, empty operating hours, ineligible workspace
        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Completely Empty Clinic",
            OperatingHours = "   ", // whitespace only
            IsWorkspaceEligible = false,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("*Facility has not been granted workspace eligibility for patient app directory publishing in Portal*");
        ex.WithMessage("*Operating hours must be configured*");
        ex.WithMessage("*At least one active licensed doctor with PRC license number is required*");
        ex.WithMessage("*At least one active clinic service must be published in the fee schedule*");

        settings.IsDirectoryPublished.Should().BeFalse();
        interopPublisher.DidNotReceiveWithAnyArgs().Enqueue<FacilityCreatedEvent>(
            default!, default!, default!, default, default!);
    }

    [Fact]
    public async Task Unpublish_WhenWorkspaceIneligible_SucceedsUnconditionally_AndEmitsIsPublicFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Metro Care",
            OperatingHours = "Mon-Fri 8:00 AM - 5:00 PM",
            IsWorkspaceEligible = false, // Ineligible
            IsDirectoryPublished = true  // Was previously published
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(false), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeFalse();
        settings.IsDirectoryPublished.Should().BeFalse();

        interopPublisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.IsDirectoryPublished == false &&
                e.IsWorkspaceEligible == false &&
                e.IsPublic == false));
    }

    [Fact]
    public async Task Unpublish_WhenReadinessIncomplete_SucceedsUnconditionally()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Zero doctors, zero services, empty hours
        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Decommissioning Clinic",
            OperatingHours = "",
            IsWorkspaceEligible = false,
            IsDirectoryPublished = true
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(false), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeFalse();
        settings.IsDirectoryPublished.Should().BeFalse();

        interopPublisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.IsDirectoryPublished == false &&
                e.IsPublic == false));
    }

    [Fact]
    public async Task Publish_WhenWorkspaceEligibleAndOperationalChecksPass_EmitsIsPublicTrue()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        await SeedFullOperationalReadinessAsync(staffRepo, servicesRepo, uow);

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Apex Multispecialty Center",
            OperatingHours = "Mon-Sat 8:00 AM - 6:00 PM",
            SpecialtyMode = "multispecialty",
            LetterheadAddress = "Medical Center Plaza, Pasig",
            LetterheadContact = "0918-123-4567",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeTrue();
        settings.IsDirectoryPublished.Should().BeTrue();

        interopPublisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.Classification == "Multi-Specialty Clinic" &&
                e.IsWorkspaceEligible == true &&
                e.IsDirectoryPublished == true &&
                e.IsPublic == true));
    }

    [Fact]
    public async Task UpdateFacilitySettings_WhenEligible_PreservesIsWorkspaceEligibleTrue()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Old Name",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = true
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act - Staff updates clinic name and operating hours
        var result = await handler.Handle(new UpdateClinicSettingsCommand(
            ClinicName: "Updated Name",
            OperatingHours: "Mon-Sat 9:00 AM - 7:00 PM"), CancellationToken.None);

        // Assert - Staff mutation cannot affect IsWorkspaceEligible
        result.IsWorkspaceEligible.Should().BeTrue();
        settings.IsWorkspaceEligible.Should().BeTrue();
        settings.ClinicName.Should().Be("Updated Name");
    }

    [Fact]
    public async Task UpdateFacilitySettings_WhenIneligible_PreservesIsWorkspaceEligibleFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Ineligible Clinic",
            IsWorkspaceEligible = false,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await handler.Handle(new UpdateClinicSettingsCommand(
            ClinicName: "Mutated Name"), CancellationToken.None);

        // Assert
        result.IsWorkspaceEligible.Should().BeFalse();
        settings.IsWorkspaceEligible.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateFacilitySettings_WhenNoPriorSettings_InitializesIsWorkspaceEligibleFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var handler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act - Fresh clinic creates initial settings via update command
        var result = await handler.Handle(new UpdateClinicSettingsCommand(
            ClinicName: "Fresh New Clinic"), CancellationToken.None);

        // Assert
        result.IsWorkspaceEligible.Should().BeFalse();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GetClinicPublishingReadiness_ReturnsIsWorkspaceEligible_Accurately(bool isEligible)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);

        await SeedFullOperationalReadinessAsync(staffRepo, servicesRepo, uow);

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Readiness Clinic",
            OperatingHours = "Mon-Fri 8:00 AM - 5:00 PM",
            IsWorkspaceEligible = isEligible
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetClinicPublishingReadinessQueryHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext);

        // Act
        var readiness = await handler.Handle(new GetClinicPublishingReadinessQuery(), CancellationToken.None);

        // Assert
        readiness.IsWorkspaceEligible.Should().Be(isEligible);
        readiness.IsReady.Should().BeTrue();
    }

    [Fact]
    public async Task GetClinicPublishingReadiness_WhenSettingsNull_ReturnsIsWorkspaceEligibleFalse()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);

        var handler = new GetClinicPublishingReadinessQueryHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext);

        // Act
        var readiness = await handler.Handle(new GetClinicPublishingReadinessQuery(), CancellationToken.None);

        // Assert
        readiness.IsWorkspaceEligible.Should().BeFalse();
        readiness.IsReady.Should().BeFalse();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GetFacilitySettings_ReturnsIsWorkspaceEligible_Accurately(bool isEligible)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Settings Clinic",
            IsWorkspaceEligible = isEligible
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Assert
        result.IsWorkspaceEligible.Should().Be(isEligible);
    }

    [Fact]
    public async Task GetFacilitySettings_WhenSettingsNull_AutoProvisionsWithIsWorkspaceEligibleFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Assert
        result.IsWorkspaceEligible.Should().BeFalse();
    }

    [Fact]
    public async Task Publish_IdempotentConsecutivePublishes_MaintainConsistency()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        await SeedFullOperationalReadinessAsync(staffRepo, servicesRepo, uow);

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Apex Dental",
            OperatingHours = "Mon-Sat 8:00 AM - 5:00 PM",
            SpecialtyMode = "dental",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act 1 - Publish first time
        var res1 = await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);
        res1.Success.Should().BeTrue();
        res1.IsPublished.Should().BeTrue();
        settings.IsDirectoryPublished.Should().BeTrue();

        // Act 2 - Publish second time (re-publish / update payload)
        var res2 = await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);
        res2.Success.Should().BeTrue();
        res2.IsPublished.Should().BeTrue();
        settings.IsDirectoryPublished.Should().BeTrue();

        // Outbox received both publications with IsPublic == true
        interopPublisher.Received(2).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e => e.IsPublic == true && e.IsWorkspaceEligible == true && e.IsDirectoryPublished == true));
    }

    [Fact]
    public async Task Unpublish_IdempotentConsecutiveUnpublishes_MaintainConsistency()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Apex Dental",
            OperatingHours = "Mon-Sat 8:00 AM - 5:00 PM",
            SpecialtyMode = "dental",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = true
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act 1 - Unpublish
        var res1 = await handler.Handle(new PublishClinicToDirectoryCommand(false), CancellationToken.None);
        res1.Success.Should().BeTrue();
        res1.IsPublished.Should().BeFalse();
        settings.IsDirectoryPublished.Should().BeFalse();

        // Act 2 - Unpublish again
        var res2 = await handler.Handle(new PublishClinicToDirectoryCommand(false), CancellationToken.None);
        res2.Success.Should().BeTrue();
        res2.IsPublished.Should().BeFalse();
        settings.IsDirectoryPublished.Should().BeFalse();

        // Outbox received both unpublishings with IsPublic == false
        interopPublisher.Received(2).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e => e.IsPublic == false && e.IsDirectoryPublished == false));
    }
}
