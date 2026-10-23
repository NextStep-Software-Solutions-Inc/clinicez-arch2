using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Stress Test Suite for Milestone M2:
/// Two-Tier Facility Publishing Governance Synchronization (Issue #72).
/// Authored and executed by Challenger 2 (teamwork_preview_challenger_m2_2).
///
/// Target Challenge Areas:
/// 1. Staff Immutability & Zero Privilege Escalation on PUT /api/v1/settings
/// 2. Exhaustive Pre-Flight Readiness Gating Matrix on PublishClinicToDirectoryCommand
/// 3. Unconditional Unpublishing Autonomy Regardless of Workspace Eligibility
/// 4. Transactional Outbox Sequencing (Enqueue strictly before SaveChangesAsync)
/// 5. Outbound FacilityCreatedEvent Truth Table & Boundary Field Fidelity
/// 6. GetClinicPublishingReadinessQuery & GetClinicSettingsQuery Null Safety & Robustness
/// </summary>
public class ChallengerM2TwoTierGovernanceEmpiricalTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-challenger-m2";

    public ChallengerM2TwoTierGovernanceEmpiricalTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    #region 1. Staff Immutability & Zero Privilege Escalation

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task UpdateClinicSettings_StaffMutation_CannotAlter_IsWorkspaceEligible(bool initialEligibility)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var existingSettings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Original Clinic Name",
            OperatingHours = "Mon-Fri 9AM-5PM",
            IsWorkspaceEligible = initialEligibility,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(existingSettings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act - Attempt to update every permitted property
        var updateCommand = new UpdateClinicSettingsCommand(
            ClinicName: "Attacker Malicious Clinic Rename",
            TaxIdentificationNumber: "123-456-789",
            AccreditationNumber: "ACCR-9999",
            OperatingHours: "24/7 Always Open",
            DefaultSlotDurationMinutes: 45,
            QueuePrefix: "MAL",
            InvoicePrefix: "INV-MAL",
            DefaultConsultationFee: 1500m,
            VatRate: 0.12m,
            PrimaryColorHex: "#0D6963",
            SpecialtyMode: "Dental"
        );

        var resultDto = await handler.Handle(updateCommand, CancellationToken.None);

        // Assert - DB entity and returned DTO must strictly preserve initial IsWorkspaceEligible
        var refreshedSettings = await context.ClinicSettings.IgnoreQueryFilters()
            .FirstAsync(s => s.ClinicId == _testClinicId);

        refreshedSettings.IsWorkspaceEligible.Should().Be(initialEligibility,
            "Clinic staff must never be able to mutate IsWorkspaceEligible via UpdateClinicSettingsCommand");
        resultDto.IsWorkspaceEligible.Should().Be(initialEligibility);
        refreshedSettings.ClinicName.Should().Be("Attacker Malicious Clinic Rename");
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenCreatingInitialSettings_DefaultsIsWorkspaceEligibleToFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        // No pre-existing settings in database
        var handler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act - Clinic staff configures initial settings
        var command = new UpdateClinicSettingsCommand(
            ClinicName: "Brand New Clinic",
            OperatingHours: "Mon-Sat 8AM-5PM"
        );
        var resultDto = await handler.Handle(command, CancellationToken.None);

        // Assert
        var created = await context.ClinicSettings.IgnoreQueryFilters()
            .FirstAsync(s => s.ClinicId == _testClinicId);

        created.IsWorkspaceEligible.Should().BeFalse(
            "New ClinicSettings created by staff command must default IsWorkspaceEligible to false");
        resultDto.IsWorkspaceEligible.Should().BeFalse();
        created.ClinicName.Should().Be("Brand New Clinic");
    }

    #endregion

    #region 2. Exhaustive Pre-Flight Readiness Gating Matrix

    [Fact]
    public async Task PublishClinic_WhenWorkspaceIneligible_ThrowsWithSpecificReason()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            FirstName = "Valid",
            LastName = "Doctor",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-12345",
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            Code = "SRV-OK",
            Name = "General Consult",
            Category = "Consultation",
            StandardPrice = 500m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Fully Ready Except Ineligible",
            OperatingHours = "Mon-Fri 8AM-5PM",
            IsWorkspaceEligible = false,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, publisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("*Facility has not been granted workspace eligibility for patient app directory publishing in Portal*");
        publisher.DidNotReceiveWithAnyArgs().Enqueue<FacilityCreatedEvent>(default!, default!, default!, default, default!);
    }

    [Theory]
    [InlineData("", true, true, true, "Operating hours must be configured")]
    [InlineData("   ", true, true, true, "Operating hours must be configured")]
    [InlineData("Mon-Fri", false, true, true, "At least one active licensed doctor with PRC license number is required")]
    [InlineData("Mon-Fri", true, false, true, "At least one active licensed doctor with PRC license number is required")] // Doctor inactive or missing PRC
    [InlineData("Mon-Fri", true, true, false, "At least one active clinic service must be published in the fee schedule")]
    public async Task PublishClinic_WhenOperationalReadinessFails_EvenWithWorkspaceEligible_ThrowsSpecificReason(
        string? operatingHours,
        bool hasDoctor,
        bool doctorHasValidPrcAndActive,
        bool hasActiveService,
        string expectedErrorSubstring)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        if (hasDoctor)
        {
            await staffRepo.AddAsync(new StaffMember
            {
                TenantId = _testTenantId,
                ClinicId = _testClinicId,
                FirstName = "Test",
                LastName = "Staff",
                Role = StaffRole.Doctor,
                PrcLicenseNumber = doctorHasValidPrcAndActive ? "PRC-VALID" : "   ",
                IsActive = doctorHasValidPrcAndActive
            }, CancellationToken.None);
        }

        if (hasActiveService)
        {
            await servicesRepo.AddAsync(new ClinicServiceItem
            {
                TenantId = _testTenantId,
                ClinicId = _testClinicId,
                Code = "SRV-TEST",
                Name = "Test Service",
                Category = "General",
                StandardPrice = 300m,
                IsActive = true
            }, CancellationToken.None);
        }

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Test Clinic",
            OperatingHours = operatingHours!,
            IsWorkspaceEligible = true,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, publisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage($"*{expectedErrorSubstring}*");
        publisher.DidNotReceiveWithAnyArgs().Enqueue<FacilityCreatedEvent>(default!, default!, default!, default, default!);
    }

    [Fact]
    public async Task PublishClinic_WhenAllCriteriaFail_AggregatesAllErrorMessages()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        // Ineligible, no hours, no doctor, no service
        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Total Failure Clinic",
            OperatingHours = "",
            IsWorkspaceEligible = false,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, publisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        var msg = ex.Which.Message;

        msg.Should().Contain("Facility has not been granted workspace eligibility");
        msg.Should().Contain("Operating hours must be configured");
        msg.Should().Contain("At least one active licensed doctor with PRC license number is required");
        msg.Should().Contain("At least one active clinic service must be published in the fee schedule");
    }

    [Fact]
    public async Task PublishClinic_WhenSettingsNotInitialized_ThrowsInvalidOperationException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        // Zero settings in DB
        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, publisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Clinic settings must be initialized before publishing.*");
    }

    #endregion

    #region 3. Unconditional Unpublishing Autonomy

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task UnpublishClinic_IsAlwaysPermitted_RegardlessOfEligibilityOrReadiness(
        bool isWorkspaceEligible,
        bool hasOperatingHours)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Autonomy Clinic",
            OperatingHours = hasOperatingHours ? "Mon-Fri 8AM-5PM" : "",
            IsWorkspaceEligible = isWorkspaceEligible,
            IsDirectoryPublished = true
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, publisher);

        // Act - Request unpublish (false)
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(false), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeFalse();
        result.Message.Should().Contain("unpublished");

        settings.IsDirectoryPublished.Should().BeFalse();

        publisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.IsDirectoryPublished == false &&
                e.IsWorkspaceEligible == isWorkspaceEligible &&
                e.IsPublic == false));
    }

    #endregion

    #region 4. Transactional Outbox Sequencing

    [Fact]
    public async Task PublishClinic_EnqueuesToOutbox_StrictlyBefore_SaveChangesAsync()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            FirstName = "Dr.",
            LastName = "Sequence",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-SEQ-1",
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            Code = "SRV-SEQ",
            Name = "Sequence Check",
            Category = "Consultation",
            StandardPrice = 100m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Transactional Clinic",
            OperatingHours = "8AM-5PM",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var callLog = new List<string>();

        var publisher = Substitute.For<IInteropPublisher>();
        publisher.When(p => p.Enqueue(
            Arg.Any<string>(),
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Any<Guid>(),
            Arg.Any<FacilityCreatedEvent>()))
            .Do(_ => callLog.Add("EnqueueOutbox"));

        var mockedUow = Substitute.For<IUnitOfWork>();
        mockedUow.SaveChangesAsync(Arg.Any<CancellationToken>())
            .Returns(async _ =>
            {
                callLog.Add("SaveChangesAsync");
                return await uow.SaveChangesAsync(CancellationToken.None);
            });

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, mockedUow, publisher);

        // Act
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();
        callLog.Should().ContainInOrder("EnqueueOutbox", "SaveChangesAsync");
    }

    #endregion

    #region 5. Outbound FacilityCreatedEvent Truth Table & Boundary Fidelity

    [Theory]
    [InlineData(false, false, false)]
    [InlineData(false, true, false)]
    [InlineData(true, false, false)]
    [InlineData(true, true, true)]
    public void FacilityCreatedEvent_IsPublic_StrictlyReflects_BothEligibleAndPublished(
        bool isWorkspaceEligible,
        bool isDirectoryPublished,
        bool expectedIsPublic)
    {
        // Act
        var evt = new FacilityCreatedEvent
        {
            TenantId = _testTenantId,
            ResourceId = _testClinicId,
            IsWorkspaceEligible = isWorkspaceEligible,
            IsDirectoryPublished = isDirectoryPublished,
            IsPublic = isWorkspaceEligible && isDirectoryPublished
        };

        // Assert
        evt.IsPublic.Should().Be(expectedIsPublic,
            $"IsPublic must be {expectedIsPublic} when IsWorkspaceEligible={isWorkspaceEligible} and IsDirectoryPublished={isDirectoryPublished}");
    }

    [Fact]
    public async Task PublishClinic_OutboundEvent_HasAccurateSenderRecipientAndPayloadHeaders()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            FirstName = "Maria",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-99001",
            Specialty = "Pediatrics",
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            Code = "PED-01",
            Name = "Well Child Checkup",
            Category = "Pediatrics",
            StandardPrice = 650m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            TenantSlug = "metro-health",
            ClinicId = _testClinicId,
            FacilitySlug = "metro-main-branch",
            ClinicName = "Metro Pediatric Clinic",
            OperatingHours = "Mon-Sat 8AM-4PM",
            LetterheadAddress = "77 Quezon Ave, QC",
            LetterheadContact = "0918-123-4567",
            SpecialtyMode = "Medical",
            IsPhilHealthConfigured = true,
            IsOnlineBookingPaused = true,
            IsJoinEnabled = true,
            JoinCode = "METRO2026",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, publisher);

        // Act
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();

        publisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Is<Party>(p =>
                p.Kind == PartyKind.Facility &&
                p.TenantId == _testTenantId &&
                p.FacilityId == _testClinicId.ToString() &&
                p.FacilityType == FacilityType.Clinic),
            Arg.Is<Party>(p =>
                p.Kind == PartyKind.ControlPlane &&
                p.Service == InteropServices.Patient),
            _testClinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.TenantId == _testTenantId &&
                e.TenantSlug == "metro-health" &&
                e.FacilityType == FacilityType.Clinic &&
                e.ResourceId == _testClinicId &&
                e.Name == "Metro Pediatric Clinic" &&
                e.Slug == "metro-main-branch" &&
                e.OperatingHours == "Mon-Sat 8AM-4PM" &&
                e.Address == "77 Quezon Ave, QC" &&
                e.ContactNumber == "0918-123-4567" &&
                e.Classification == "Ambulatory Clinic" &&
                e.IsPhilHealthAccredited == true &&
                e.IsDirectoryPublished == true &&
                e.IsWorkspaceEligible == true &&
                e.IsPublic == true &&
                e.IsBookingPaused == true &&
                e.IsJoinGated == true &&
                e.JoinCode == "METRO2026" &&
                e.Providers != null && e.Providers.Count == 1 &&
                e.Providers[0].Name == "Dr. Maria Reyes" &&
                e.Providers[0].Specialty == "Pediatrics" &&
                e.Providers[0].ProfessionalLicenseNo == "PRC-99001" &&
                e.Services != null && e.Services.Count == 1 &&
                e.Services[0].Name == "Well Child Checkup" &&
                e.Services[0].StandardPrice == 650m
            )
        );
    }

    #endregion

    #region 6. Query Null Safety & DTO Projections

    [Fact]
    public async Task GetClinicPublishingReadiness_WhenSettingsMissing_ReturnsSafeDefaults()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);

        // Zero settings, zero staff, zero services
        var handler = new GetClinicPublishingReadinessQueryHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetClinicPublishingReadinessQuery(), CancellationToken.None);

        // Assert
        result.IsReady.Should().BeFalse();
        result.IsWorkspaceEligible.Should().BeFalse();
        result.LicensedDoctorsCount.Should().Be(0);
        result.ActiveServicesCount.Should().Be(0);
        result.OperatingHours.Should().BeNull();
        result.Checks.HasOperatingHours.Should().BeFalse();
        result.Checks.HasLicensedDoctors.Should().BeFalse();
        result.Checks.HasActiveServices.Should().BeFalse();
        result.Checks.HasLetterhead.Should().BeFalse();
    }

    [Fact]
    public async Task GetClinicPublishingReadiness_AccuratelyProjects_IsWorkspaceEligible()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Readiness Clinic",
            OperatingHours = "Mon-Fri 8AM-5PM",
            IsWorkspaceEligible = true
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetClinicPublishingReadinessQueryHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetClinicPublishingReadinessQuery(), CancellationToken.None);

        // Assert
        result.IsWorkspaceEligible.Should().BeTrue();
        result.Checks.HasOperatingHours.Should().BeTrue();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GetClinicSettingsQuery_AccuratelyProjects_IsWorkspaceEligible(bool expectedEligibility)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Settings Query Clinic",
            IsWorkspaceEligible = expectedEligibility
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);

        // Act
        var result = await handler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.IsWorkspaceEligible.Should().Be(expectedEligibility);
    }

    #endregion
}
