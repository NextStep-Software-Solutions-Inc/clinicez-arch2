using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

public class Milestone3QueueSeriesAdversarialTests
{
    private static IClinicIdentityProvider IdentityOf(Guid clinicId, string tenantId)
    {
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns(new ClinicIdentity(tenantId, clinicId, "Challenger Clinic"));
        return identity;
    }

    [Fact]
    public async Task PrefixIsolation_InterleavedSeries_DoNotInterfere()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_challenger_m3";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var appointmentPublisher = Substitute.For<IPatientAppointmentPublisher>();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, clinicContext, IdentityOf(clinicId, tenantId), appointmentPublisher);

        var fixedDate = new DateOnly(2026, 10, 31);

        // Sequence of check-ins across multiple prefixes:
        // Q, SQ, Q, V, SV, P, SP, A, SA, SQ, Q, V
        var checkIns = new (string? prefix, VisitType vType, string expected)[]
        {
            ("Q", VisitType.RoutineCheckup, "Q-001"),
            ("SQ", VisitType.RoutineCheckup, "SQ-001"),
            ("Q", VisitType.RoutineCheckup, "Q-002"),
            ("V", VisitType.PreventiveHealthAssessment, "V-001"),
            ("SV", VisitType.PreventiveHealthAssessment, "SV-001"),
            ("P", VisitType.PreventiveHealthAssessment, "P-001"),
            ("SP", VisitType.PreventiveHealthAssessment, "SP-001"),
            ("A", VisitType.PreventiveHealthAssessment, "A-001"),
            ("SA", VisitType.PreventiveHealthAssessment, "SA-001"),
            ("SQ", VisitType.RoutineCheckup, "SQ-002"),
            ("Q", VisitType.RoutineCheckup, "Q-003"),
            ("V", VisitType.PreventiveHealthAssessment, "V-002"),
            ("P", VisitType.PreventiveHealthAssessment, "P-002"),
            ("A", VisitType.PreventiveHealthAssessment, "A-002"),
            ("SA", VisitType.PreventiveHealthAssessment, "SA-002"),
            ("SV", VisitType.PreventiveHealthAssessment, "SV-002"),
            ("SP", VisitType.PreventiveHealthAssessment, "SP-002"),
        };

        foreach (var (prefix, vType, expected) in checkIns)
        {
            var res = await handler.Handle(new CheckInPatientCommand(
                PatientId: Guid.NewGuid(),
                PatientName: $"Patient {expected}",
                SeriesPrefix: prefix,
                VisitType: vType,
                QueueDate: fixedDate
            ), CancellationToken.None);

            res.QueueNumber.Should().Be(expected, $"prefix {prefix} sequence should isolate properly");
        }
    }

    [Fact]
    public async Task PrefixIsolation_SubstringsAndOverlappingPrefixNames_DoNotInterfere()
    {
        // Arrange: Test prefixes where one is a substring of another ("Q" vs "QA", "S" vs "SQ")
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_challenger_m3";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var handler = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            uow, clinicContext, IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>());

        var fixedDate = new DateOnly(2026, 10, 31);

        // Check in QA-001
        var r1 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "QA Pat", SeriesPrefix: "QA", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r1.QueueNumber.Should().Be("QA-001");

        // Check in Q -> must be Q-001 (not Q-002)
        var r2 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Q Pat", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r2.QueueNumber.Should().Be("Q-001");

        // Check in S -> S-001
        var r3 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "S Pat", SeriesPrefix: "S", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r3.QueueNumber.Should().Be("S-001");

        // Check in SQ -> SQ-001
        var r4 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "SQ Pat", SeriesPrefix: "SQ", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r4.QueueNumber.Should().Be("SQ-001");

        // Another Q -> Q-002
        var r5 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Q Pat 2", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r5.QueueNumber.Should().Be("Q-002");
    }

    [Fact]
    public async Task SuffixParsing_RolloverBeyond999_FormatsCorrectlyAndIncrements()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_challenger_m3";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var fixedDate = new DateOnly(2026, 10, 31);

        // Pre-seed an item with sequence 999: "Q-999"
        await context.QueueItems.AddAsync(new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueNumber = "Q-999",
            SequenceNumber = 999,
            QueueDate = fixedDate,
            PatientId = Guid.NewGuid(),
            PatientName = "Pre-seeded 999",
            Status = QueueStatus.Completed,
            VisitType = VisitType.RoutineCheckup,
            CheckInTime = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            uow, clinicContext, IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>());

        // Act 1: Check in when max is 999
        var res1 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Rollover Pat 1", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);

        // Assert 1: next should be 1000 ("Q-1000")
        res1.QueueNumber.Should().Be("Q-1000");
        res1.SequenceNumber.Should().Be(1000);

        // Act 2: Check in subsequent patient
        var res2 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Rollover Pat 2", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);

        // Assert 2: next should be 1001 ("Q-1001")
        res2.QueueNumber.Should().Be("Q-1001");
        res2.SequenceNumber.Should().Be(1001);
    }

    [Fact]
    public async Task SuffixParsing_GapsAndPreExistingNumbers_ResolvesMaxProperly()
    {
        // Arrange: Pre-seed tickets with gaps: Q-001, Q-050, Q-100
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_challenger_m3";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var fixedDate = new DateOnly(2026, 10, 31);

        int[] existingSeqs = [1, 50, 100];
        foreach (var seq in existingSeqs)
        {
            await context.QueueItems.AddAsync(new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                QueueNumber = $"Q-{seq:D3}",
                SequenceNumber = seq,
                QueueDate = fixedDate,
                PatientId = Guid.NewGuid(),
                PatientName = $"Existing {seq}",
                Status = QueueStatus.Completed,
                VisitType = VisitType.RoutineCheckup,
                CheckInTime = DateTime.UtcNow
            });
        }
        await context.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            uow, clinicContext, IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>());

        // Act: next check-in
        var res = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Gap Patient", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);

        // Assert: should take max (100) + 1 = 101 -> "Q-101"
        res.QueueNumber.Should().Be("Q-101");
        res.SequenceNumber.Should().Be(101);
    }

    [Fact]
    public async Task SuffixParsing_MalformedOrInvalidSuffix_IsIgnoredGracefully()
    {
        // Arrange: Pre-seed tickets with non-numeric suffixes
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_challenger_m3";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var fixedDate = new DateOnly(2026, 10, 31);

        string[] malformed = ["Q-INVALID", "Q-", "Q-ABC-123", "Q-000"];
        foreach (var m in malformed)
        {
            await context.QueueItems.AddAsync(new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                QueueNumber = m,
                SequenceNumber = 0,
                QueueDate = fixedDate,
                PatientId = Guid.NewGuid(),
                PatientName = "Malformed Pat",
                Status = QueueStatus.Completed,
                VisitType = VisitType.RoutineCheckup,
                CheckInTime = DateTime.UtcNow
            });
        }
        await context.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            uow, clinicContext, IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>());

        // Act: next check-in with prefix "Q"
        var res = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Clean Pat", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);

        // Assert: Since Q-000 parsedSeq is 0, and others fail TryParse, maxSeq is 0 -> next is 1 -> "Q-001"
        res.QueueNumber.Should().Be("Q-001");
        res.SequenceNumber.Should().Be(1);
    }

    [Fact]
    public async Task Normalization_Null_Empty_Whitespace_And_LowercasePrefixes()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_challenger_m3";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var handler = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            uow, clinicContext, IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>());

        var fixedDate = new DateOnly(2026, 10, 31);

        // 1. null prefix -> defaults to "Q", should get "Q-001"
        var r1 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Pat 1", SeriesPrefix: null, VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r1.QueueNumber.Should().Be("Q-001");

        // 2. empty prefix "" -> defaults to "Q", should get "Q-002"
        var r2 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Pat 2", SeriesPrefix: "", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r2.QueueNumber.Should().Be("Q-002");

        // 3. whitespace prefix "   " -> defaults to "Q", should get "Q-003"
        var r3 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Pat 3", SeriesPrefix: "   ", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r3.QueueNumber.Should().Be("Q-003");

        // 4. lowercase "sq" -> normalized to "SQ", should get "SQ-001"
        var r4 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Pat 4", SeriesPrefix: "sq", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r4.QueueNumber.Should().Be("SQ-001");

        // 5. whitespace with lowercase "  sq  " -> normalized to "SQ", should get "SQ-002"
        var r5 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Pat 5", SeriesPrefix: "  sq  ", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r5.QueueNumber.Should().Be("SQ-002");

        // 6. trailing hyphen "sq-" -> normalized to "SQ", should get "SQ-003"
        var r6 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Pat 6", SeriesPrefix: "sq-", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r6.QueueNumber.Should().Be("SQ-003");

        // 7. hyphen only " - " -> trimmed becomes "", defaults to "Q", should get "Q-004"
        var r7 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Pat 7", SeriesPrefix: " - ", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r7.QueueNumber.Should().Be("Q-004");

        // 8. uppercase with trailing hyphen "Q-" -> normalized to "Q", should get "Q-005"
        var r8 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Pat 8", SeriesPrefix: "Q-", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        r8.QueueNumber.Should().Be("Q-005");
    }

    [Fact]
    public async Task DateIsolation_SeparateDateSequences()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_challenger_m3";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var handler = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            uow, clinicContext, IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>());

        var yesterday = new DateOnly(2026, 10, 30);
        var today = new DateOnly(2026, 10, 31);
        var tomorrow = new DateOnly(2026, 11, 1);

        // Pre-seed tickets for yesterday: Q-001, Q-002, SQ-001
        await context.QueueItems.AddRangeAsync(
            new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                QueueNumber = "Q-001",
                SequenceNumber = 1,
                QueueDate = yesterday,
                PatientId = Guid.NewGuid(),
                PatientName = "Yesterday Pat 1",
                Status = QueueStatus.Completed,
                VisitType = VisitType.RoutineCheckup,
                CheckInTime = DateTime.UtcNow.AddDays(-1)
            },
            new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                QueueNumber = "Q-002",
                SequenceNumber = 2,
                QueueDate = yesterday,
                PatientId = Guid.NewGuid(),
                PatientName = "Yesterday Pat 2",
                Status = QueueStatus.Completed,
                VisitType = VisitType.RoutineCheckup,
                CheckInTime = DateTime.UtcNow.AddDays(-1)
            },
            new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                QueueNumber = "SQ-001",
                SequenceNumber = 1,
                QueueDate = yesterday,
                PatientId = Guid.NewGuid(),
                PatientName = "Yesterday SQ Pat",
                Status = QueueStatus.Completed,
                VisitType = VisitType.RoutineCheckup,
                CheckInTime = DateTime.UtcNow.AddDays(-1)
            }
        );
        await context.SaveChangesAsync();

        // Act 1: Today's check-in for Q -> should start back at Q-001
        var todayQ1 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Today Q 1", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: today), CancellationToken.None);
        todayQ1.QueueNumber.Should().Be("Q-001");

        // Act 2: Today's check-in for SQ -> should start back at SQ-001
        var todaySQ1 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Today SQ 1", SeriesPrefix: "SQ", VisitType: VisitType.RoutineCheckup, QueueDate: today), CancellationToken.None);
        todaySQ1.QueueNumber.Should().Be("SQ-001");

        // Act 3: Tomorrow's check-in for Q -> should also start at Q-001
        var tomorrowQ1 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Tomorrow Q 1", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: tomorrow), CancellationToken.None);
        tomorrowQ1.QueueNumber.Should().Be("Q-001");

        // Act 4: Today's second Q ticket -> should be Q-002 (not affected by tomorrow or yesterday)
        var todayQ2 = await handler.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "Today Q 2", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: today), CancellationToken.None);
        todayQ2.QueueNumber.Should().Be("Q-002");
    }

    [Fact]
    public async Task ClinicIsolation_SeparateClinicSequences()
    {
        // Arrange
        var clinic1Id = Guid.NewGuid();
        var clinic2Id = Guid.NewGuid();
        var tenantId = "tenant_challenger_m3";

        var fixedDate = new DateOnly(2026, 10, 31);

        // Clinic 1 setup
        var clinicContext1 = Substitute.For<IClinicContext>();
        clinicContext1.ClinicId.Returns(clinic1Id);
        clinicContext1.TenantId.Returns(tenantId);

        // Clinic 2 setup
        var clinicContext2 = Substitute.For<IClinicContext>();
        clinicContext2.ClinicId.Returns(clinic2Id);
        clinicContext2.TenantId.Returns(tenantId);

        // Share the same DB context to verify cross-clinic isolation in the database
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext1);

        var handler1 = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            uow, clinicContext1, IdentityOf(clinic1Id, tenantId),
            Substitute.For<IPatientAppointmentPublisher>());

        var handler2 = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            uow, clinicContext2, IdentityOf(clinic2Id, tenantId),
            Substitute.For<IPatientAppointmentPublisher>());

        // Act 1: Clinic 1 checks in two Q patients and one SQ patient
        var c1_q1 = await handler1.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "C1 Pat 1", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        c1_q1.QueueNumber.Should().Be("Q-001");

        var c1_q2 = await handler1.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "C1 Pat 2", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        c1_q2.QueueNumber.Should().Be("Q-002");

        var c1_sq1 = await handler1.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "C1 Pat 3", SeriesPrefix: "SQ", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        c1_sq1.QueueNumber.Should().Be("SQ-001");

        // Act 2: Clinic 2 checks in Q patient -> must receive Q-001 (isolated from Clinic 1)
        var c2_q1 = await handler2.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "C2 Pat 1", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        c2_q1.QueueNumber.Should().Be("Q-001");

        // Act 3: Clinic 2 checks in SQ patient -> must receive SQ-001 (isolated from Clinic 1)
        var c2_sq1 = await handler2.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "C2 Pat 2", SeriesPrefix: "SQ", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        c2_sq1.QueueNumber.Should().Be("SQ-001");

        // Act 4: Clinic 1 checks in third Q patient -> must receive Q-003
        var c1_q3 = await handler1.Handle(new CheckInPatientCommand(
            Guid.NewGuid(), "C1 Pat 4", SeriesPrefix: "Q", VisitType: VisitType.RoutineCheckup, QueueDate: fixedDate), CancellationToken.None);
        c1_q3.QueueNumber.Should().Be("Q-003");
    }

    [Fact]
    public void Validator_SeriesPrefixConstraints_TestedCorrectly()
    {
        var validator = new CheckInPatientCommandValidator();

        // Null series prefix -> valid
        var cmdNull = new CheckInPatientCommand(Guid.NewGuid(), "Valid Name", SeriesPrefix: null);
        var resultNull = validator.TestValidate(cmdNull);
        resultNull.ShouldNotHaveValidationErrorFor(x => x.SeriesPrefix);

        // Empty series prefix -> valid
        var cmdEmpty = new CheckInPatientCommand(Guid.NewGuid(), "Valid Name", SeriesPrefix: "");
        var resultEmpty = validator.TestValidate(cmdEmpty);
        resultEmpty.ShouldNotHaveValidationErrorFor(x => x.SeriesPrefix);

        // 10 chars series prefix -> valid
        var cmd10 = new CheckInPatientCommand(Guid.NewGuid(), "Valid Name", SeriesPrefix: "ABCDEFGHIJ");
        var result10 = validator.TestValidate(cmd10);
        result10.ShouldNotHaveValidationErrorFor(x => x.SeriesPrefix);

        // 11 chars series prefix -> invalid
        var cmd11 = new CheckInPatientCommand(Guid.NewGuid(), "Valid Name", SeriesPrefix: "ABCDEFGHIJK");
        var result11 = validator.TestValidate(cmd11);
        result11.ShouldHaveValidationErrorFor(x => x.SeriesPrefix);
    }
}
