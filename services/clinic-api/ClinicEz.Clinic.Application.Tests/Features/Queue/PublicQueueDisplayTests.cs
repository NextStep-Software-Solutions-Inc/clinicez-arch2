using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class PublicQueueDisplayTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_tv_test";

    public PublicQueueDisplayTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task Handle_WhenMaskingEnabled_ReturnsMaskedNamesForUpNext()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var clinicSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Metro Health Clinic",
            TenantSlug = "metro-health",
            FacilitySlug = "main-branch",
            TvDisplayMaskPatientNames = true
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Serving ticket
        var servingTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Cassandra Alcantara",
            DoctorName = "Dr. Sarah Santos, MD",
            RoomOrStation = "Exam Room 1",
            Status = QueueStatus.InConsultation,
            CalledTime = DateTime.UtcNow.AddMinutes(-5)
        };

        // Up next tickets
        var upNext1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            Status = QueueStatus.Triaged,
            Priority = QueuePriority.Urgent
        };

        var upNext2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-003",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara Santos",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Routine
        };

        await queueRepo.AddAsync(servingTicket, CancellationToken.None);
        await queueRepo.AddAsync(upNext1, CancellationToken.None);
        await queueRepo.AddAsync(upNext2, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, Date: today), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result!.ClinicName.Should().Be("Metro Health Clinic");
        result.MaskPatientNames.Should().BeTrue();

        // Now Serving checks
        result.NowServing.Should().HaveCount(1);
        result.NowServing[0].TicketNumber.Should().Be("Q-001");
        result.NowServing[0].DoctorName.Should().Be("Dr. Sarah Santos, MD");
        result.NowServing[0].RoomOrStation.Should().Be("Exam Room 1");

        // Up Next checks - masked names
        result.UpNext.Should().HaveCount(2);
        result.UpNext[0].TicketNumber.Should().Be("Q-002");
        result.UpNext[0].DisplayName.Should().Be("Juan C.");
        result.UpNext[0].Priority.Should().Be("Urgent");

        result.UpNext[1].TicketNumber.Should().Be("Q-003");
        result.UpNext[1].DisplayName.Should().Be("Maria S.");
        result.UpNext[1].Priority.Should().Be("Routine");

        result.PatientsWaitingCount.Should().Be(2);
    }

    [Fact]
    public async Task Handle_WhenMaskingDisabled_ReturnsFullUnmaskedNames()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var clinicSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "General Health Clinic",
            TenantSlug = "gen-health",
            FacilitySlug = "lobby",
            TvDisplayMaskPatientNames = false
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-010",
            SequenceNumber = 10,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Cassandra Alcantara",
            Status = QueueStatus.Waiting
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, Date: today), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result!.MaskPatientNames.Should().BeFalse();
        result.UpNext.Should().HaveCount(1);
        result.UpNext[0].DisplayName.Should().Be("Cassandra Alcantara");
    }

    [Fact]
    public async Task Handle_ResolvesByFacilitySlugAndTenantSlug()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var clinicSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-cdo",
            ClinicId = Guid.NewGuid(),
            ClinicName = "CDO Community Clinic",
            TenantSlug = "cdo-health",
            FacilitySlug = "main-station",
            TvDisplayMaskPatientNames = true
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPublicQueueDisplayQuery(
            TenantSlug: "cdo-health",
            FacilitySlug: "main-station"
        ), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result!.ClinicName.Should().Be("CDO Community Clinic");
        result.TenantSlug.Should().Be("cdo-health");
        result.FacilitySlug.Should().Be("main-station");
    }

    [Fact]
    public async Task Handle_WhenClinicNotFound_ReturnsNull()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: Guid.NewGuid()), CancellationToken.None);

        // Assert
        result.Should().BeNull();
    }

    [Theory]
    [InlineData("Cassandra Alcantara", "Cassandra A.")]
    [InlineData("Juan Dela Cruz", "Juan C.")]
    [InlineData("Maria Clara Santos", "Maria S.")]
    [InlineData("Cher", "C.")]
    [InlineData("Santos, Maria", "Maria S.")]
    [InlineData("Dela Cruz, Juan", "Juan D.")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void MaskPatientName_FormatsAccordingToPrivacyRules(string? input, string expected)
    {
        var result = GetPublicQueueDisplayQueryHandler.MaskPatientName(input);
        result.Should().Be(expected);
    }

    [Fact]
    public async Task UpdateFacilitySettings_PersistsTvDisplayMaskPatientNames()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var initialSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Initial Clinic",
            TvDisplayMaskPatientNames = true
        };
        await settingsRepo.AddAsync(initialSettings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act: Update to false
        var updated = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            ClinicName: "Initial Clinic",
            TvDisplayMaskPatientNames: false
        ), CancellationToken.None);

        // Assert
        updated.TvDisplayMaskPatientNames.Should().BeFalse();

        var queryHandler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);
        var retrieved = await queryHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);
        retrieved.TvDisplayMaskPatientNames.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_WhenPinConfigured_AndPinMissingOrIncorrect_ReturnsZeroTicketsAndPinRequired()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var clinicSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Secure Medical",
            TenantSlug = "secure-med",
            FacilitySlug = "main",
            TvDisplayPin = "8421"
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var serving = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "S-101",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Private Patient",
            Status = QueueStatus.InConsultation
        };
        await queueRepo.AddAsync(serving, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act 1: No PIN provided (leaked link scenario)
        var leakedResult = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, Date: today, Pin: null), CancellationToken.None);

        // Assert 1: Leaked link must not reveal tickets
        leakedResult.Should().NotBeNull();
        leakedResult!.IsPinRequired.Should().BeTrue();
        leakedResult.IsPinValid.Should().BeFalse();
        leakedResult.NowServing.Should().BeEmpty();
        leakedResult.UpNext.Should().BeEmpty();
        leakedResult.PatientsWaitingCount.Should().Be(0);

        // Act 2: Wrong PIN provided
        var wrongPinResult = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, Date: today, Pin: "9999"), CancellationToken.None);

        // Assert 2: Wrong PIN must not reveal tickets
        wrongPinResult.Should().NotBeNull();
        wrongPinResult!.IsPinRequired.Should().BeTrue();
        wrongPinResult.IsPinValid.Should().BeFalse();
        wrongPinResult.NowServing.Should().BeEmpty();

        // Act 3: Correct PIN provided
        var unlockedResult = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, Date: today, Pin: "8421"), CancellationToken.None);

        // Assert 3: Correct PIN reveals live tickets
        unlockedResult.Should().NotBeNull();
        unlockedResult!.IsPinRequired.Should().BeTrue();
        unlockedResult.IsPinValid.Should().BeTrue();
        unlockedResult.NowServing.Should().HaveCount(1);
        unlockedResult.NowServing[0].TicketNumber.Should().Be("S-101");
    }

    [Fact]
    public async Task Handle_TenantSlugNeverFallsBackToGuid()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var clinicSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = "476a9086-c0eb-4aef-8ec6-49bb1cfd17c6",
            ClinicId = _clinicId,
            ClinicName = "Nextstep Clinic",
            TenantSlug = null, // Empty tenant slug
            FacilitySlug = null
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);
        var result = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.TenantSlug.Should().NotBe("476a9086-c0eb-4aef-8ec6-49bb1cfd17c6");
        result.TenantSlug.Should().Be("clinic");
    }

    [Fact]
    public async Task UpdateFacilitySettings_PersistsTvDisplayPin()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var initialSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "PIN Test Clinic",
            TenantSlug = "pin-clinic",
            FacilitySlug = "main",
            TvDisplayPin = null
        };
        await settingsRepo.AddAsync(initialSettings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act: Save PIN 4321
        var updated = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            TvDisplayPin: "4321"
        ), CancellationToken.None);

        updated.TvDisplayPin.Should().Be("4321");
        updated.TenantSlug.Should().Be("pin-clinic");
        updated.FacilitySlug.Should().Be("main");

        var queryHandler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);
        var retrieved = await queryHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);
        retrieved.TvDisplayPin.Should().Be("4321");
        retrieved.TenantSlug.Should().Be("pin-clinic");
        retrieved.FacilitySlug.Should().Be("main");
    }
}
