using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.BackgroundServices;
using ClinicEz.Clinic.Infrastructure.Persistence;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class ReconcileEodTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_eod_test";

    public ReconcileEodTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    [Fact]
    public async Task ReconcileEod_TransitionsWaitingTriagedOnHold_AndPreservesInConsultationAndCompleted()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // 1. Waiting ticket (should transition to NoShow)
        var waitingTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient One",
            Status = QueueStatus.Waiting
        };

        // 2. Triaged ticket (should transition to NoShow)
        var triagedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Two",
            Status = QueueStatus.Triaged
        };

        // 3. OnHold ticket (should transition to NoShow)
        var onHoldTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-003",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Three",
            Status = QueueStatus.OnHold
        };

        // 4. InConsultation ticket (CRITICAL INVARIANT: MUST NOT be modified)
        var inConsultationTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-004",
            SequenceNumber = 4,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Four",
            Status = QueueStatus.InConsultation,
            CalledTime = DateTime.UtcNow.AddMinutes(-10)
        };

        // 5. Completed ticket (CRITICAL INVARIANT: MUST NOT be modified)
        var completedTime = DateTime.UtcNow.AddMinutes(-30);
        var completedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Five",
            Status = QueueStatus.Completed,
            CompletedTime = completedTime
        };

        // 6. Yesterday's Waiting ticket (MUST NOT be modified when targetDate is today)
        var yesterdayTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-099",
            SequenceNumber = 99,
            QueueDate = today.AddDays(-1),
            PatientId = Guid.NewGuid(),
            PatientName = "Yesterday Patient",
            Status = QueueStatus.Waiting
        };

        await queueRepo.AddAsync(waitingTicket, CancellationToken.None);
        await queueRepo.AddAsync(triagedTicket, CancellationToken.None);
        await queueRepo.AddAsync(onHoldTicket, CancellationToken.None);
        await queueRepo.AddAsync(inConsultationTicket, CancellationToken.None);
        await queueRepo.AddAsync(completedTicket, CancellationToken.None);
        await queueRepo.AddAsync(yesterdayTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today, TriggerType: "Manual", Reason: "Staff EOD closure"), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(3);
        result.ReconciliationDate.Should().Be(today);
        result.AffectedTicketNumbers.Should().Contain(new[] { "Q-001", "Q-002", "Q-003" });

        // Reload from database
        var reloadedWaiting = await context.Set<QueueItem>().FirstAsync(q => q.Id == waitingTicket.Id);
        reloadedWaiting.Status.Should().Be(QueueStatus.NoShow);
        reloadedWaiting.CompletedTime.Should().NotBeNull();
        reloadedWaiting.UpdatedBy.Should().Be(_staffId.ToString());

        var reloadedTriaged = await context.Set<QueueItem>().FirstAsync(q => q.Id == triagedTicket.Id);
        reloadedTriaged.Status.Should().Be(QueueStatus.NoShow);
        reloadedTriaged.CompletedTime.Should().NotBeNull();

        var reloadedOnHold = await context.Set<QueueItem>().FirstAsync(q => q.Id == onHoldTicket.Id);
        reloadedOnHold.Status.Should().Be(QueueStatus.NoShow);
        reloadedOnHold.CompletedTime.Should().NotBeNull();

        // INVARIANT VERIFICATION: InConsultation and Completed MUST remain untouched
        var reloadedInConsultation = await context.Set<QueueItem>().FirstAsync(q => q.Id == inConsultationTicket.Id);
        reloadedInConsultation.Status.Should().Be(QueueStatus.InConsultation);
        reloadedInConsultation.CompletedTime.Should().BeNull();

        var reloadedCompleted = await context.Set<QueueItem>().FirstAsync(q => q.Id == completedTicket.Id);
        reloadedCompleted.Status.Should().Be(QueueStatus.Completed);
        reloadedCompleted.CompletedTime.Should().Be(completedTime);

        // Yesterday ticket untouched
        var reloadedYesterday = await context.Set<QueueItem>().FirstAsync(q => q.Id == yesterdayTicket.Id);
        reloadedYesterday.Status.Should().Be(QueueStatus.Waiting);

        // Audit record verification
        var audits = await context.Set<EodReconciliationAudit>().ToListAsync();
        audits.Should().HaveCount(1);
        var audit = audits[0];
        audit.ClinicId.Should().Be(_clinicId);
        audit.TenantId.Should().Be(_tenantId);
        audit.ReconciliationDate.Should().Be(today);
        audit.TriggerType.Should().Be("Manual");
        audit.StaffId.Should().Be(_staffId);
        audit.TotalTicketsProcessed.Should().Be(3);
        audit.AffectedTicketNumbersJson.Should().Contain("Q-001");
        audit.AffectedTicketNumbersJson.Should().Contain("Q-002");
        audit.AffectedTicketNumbersJson.Should().Contain("Q-003");
        audit.Notes.Should().Be("Staff EOD closure");
    }

    [Fact]
    public async Task ReconcileEod_EmptyQueue_ReturnsZeroReconciled_AndCreatesAudit()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today, TriggerType: "Automatic"), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(0);
        result.AffectedTicketNumbers.Should().BeEmpty();
        result.Summary.Should().Contain("No active tickets found");

        var audits = await context.Set<EodReconciliationAudit>().ToListAsync();
        audits.Should().HaveCount(1);
        audits[0].TotalTicketsProcessed.Should().Be(0);
        audits[0].TriggerType.Should().Be("Automatic");
        audits[0].ReconciledBy.Should().Be("System / AutoEOD");
    }

    [Fact]
    public async Task UpdateFacilitySettings_PersistsEodConfiguration()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var existingSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Downtown Family Health",
            EodReconciliationTime = "21:00",
            AutoEodEnabled = true
        };
        await settingsRepo.AddAsync(existingSettings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);

        // Act: Update EOD schedule
        var updatedDto = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            EodReconciliationTime: "22:30",
            AutoEodEnabled: false
        ), CancellationToken.None);

        // Assert
        updatedDto.EodReconciliationTime.Should().Be("22:30");
        updatedDto.AutoEodEnabled.Should().BeFalse();

        var queryHandler = new GetClinicSettingsQueryHandler(settingsRepo, _clinicContext, uow);
        var fetchedDto = await queryHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        fetchedDto.EodReconciliationTime.Should().Be("22:30");
        fetchedDto.AutoEodEnabled.Should().BeFalse();
    }

    [Theory]
    [InlineData("21:00", true, "2026-10-13T12:59:00Z", false)] // 12:59 UTC = 20:59 Manila (before 21:00) -> false
    [InlineData("21:00", true, "2026-10-13T13:00:00Z", true)]  // 13:00 UTC = 21:00 Manila (at 21:00) -> true
    [InlineData("21:00", true, "2026-10-13T14:30:00Z", true)]  // 14:30 UTC = 22:30 Manila (after 21:00) -> true
    [InlineData("21:00", false, "2026-10-13T14:30:00Z", false)] // AutoEod disabled -> false
    [InlineData("invalid", true, "2026-10-13T14:30:00Z", false)] // Invalid time string -> false
    public void EodReconciliationBackgroundService_ShouldReconcile_EvaluatesScheduleCorrectly(
        string targetTime,
        bool autoEodEnabled,
        string utcTimestamp,
        bool expectedResult)
    {
        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            EodReconciliationTime = targetTime,
            AutoEodEnabled = autoEodEnabled
        };

        var utcNow = DateTime.Parse(utcTimestamp).ToUniversalTime();

        var shouldReconcile = EodReconciliationBackgroundService.ShouldReconcile(
            clinic,
            timeZoneId: "Asia/Manila",
            utcNow: utcNow,
            out var localToday);

        shouldReconcile.Should().Be(expectedResult);
        if (expectedResult)
        {
            localToday.Should().Be(new DateOnly(2026, 10, 13));
        }
    }

    [Fact]
    public async Task RunReconciliationCycleAsync_CreatesDistinctScopePerClinic()
    {
        var dbName = $"ClinicEz_ScopeTest_{Guid.NewGuid()}";
        var clinic1Id = Guid.NewGuid();
        var clinic2Id = Guid.NewGuid();

        // Seed 2 clinics configured with auto-EOD
        var (seedContext, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        seedContext.Settings.AddRange(
            new FacilitySettings
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant1",
                ClinicId = clinic1Id,
                ClinicName = "Clinic One",
                AutoEodEnabled = true,
                EodReconciliationTime = "00:00"
            },
            new FacilitySettings
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant2",
                ClinicId = clinic2Id,
                ClinicName = "Clinic Two",
                AutoEodEnabled = true,
                EodReconciliationTime = "00:00"
            });
        await seedContext.SaveChangesAsync();

        var scopesCreated = new List<IServiceScope>();
        var mockScopeFactory = Substitute.For<IServiceScopeFactory>();
        mockScopeFactory.CreateScope().Returns(callInfo =>
        {
            var scope = Substitute.For<IServiceScope>();
            var scopeProvider = Substitute.For<IServiceProvider>();

            var (scopeDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
            scopeProvider.GetService(typeof(ApplicationDbContext)).Returns(scopeDb);

            var scopeSetter = Substitute.For<IClinicScopeSetter>();
            scopeProvider.GetService(typeof(IClinicScopeSetter)).Returns(scopeSetter);

            var sender = Substitute.For<ISender>();
            sender.Send(Arg.Any<ReconcileEodCommand>(), Arg.Any<CancellationToken>())
                .Returns(new ReconcileEodResultDto(0, DateOnly.FromDateTime(DateTime.UtcNow), DateTime.UtcNow, Array.Empty<string>(), "OK"));
            scopeProvider.GetService(typeof(ISender)).Returns(sender);

            scope.ServiceProvider.Returns(scopeProvider);
            scopesCreated.Add(scope);
            return scope;
        });

        var rootProvider = Substitute.For<IServiceProvider>();
        rootProvider.GetService(typeof(IServiceScopeFactory)).Returns(mockScopeFactory);

        var logger = NullLogger<EodReconciliationBackgroundService>.Instance;
        var service = new EodReconciliationBackgroundService(rootProvider, logger);

        await service.RunReconciliationCycleAsync(CancellationToken.None);

        // 1 initial scope for querying clinic settings + 2 dedicated scopes for the 2 clinics
        scopesCreated.Should().HaveCount(3);
    }
}
