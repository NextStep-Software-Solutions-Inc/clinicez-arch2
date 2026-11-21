using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class NonDoctorWorkflowsMilestone2Challenger2Tests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_challenger_m2_2";
    private readonly Guid _staffId = Guid.NewGuid();

    public NonDoctorWorkflowsMilestone2Challenger2Tests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    [Fact]
    public async Task GetQueueQuery_DefaultActiveView_ExcludesDischargedNonDoctorAndDiverted_AndIncludesAllActiveStates()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var allPossibleStatusItems = new List<QueueItem>
        {
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-WAIT", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Waiting Pat", Status = QueueStatus.Waiting, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-TRI", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Triaged Pat", Status = QueueStatus.Triaged, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-CONS", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "InConsult Pat", Status = QueueStatus.InConsultation, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-PROC", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "PendingProc Pat", Status = QueueStatus.PendingProcedure, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-REEVAL", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "ReEval Pat", Status = QueueStatus.ReEvaluation, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-HOLD", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "OnHold Pat", Status = QueueStatus.OnHold, CheckInTime = DateTime.UtcNow },

            // Terminal / Non-active states
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-DISCH", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Discharged Pat", Status = QueueStatus.DischargedNonDoctor, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-DIV", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Diverted Pat", Status = QueueStatus.Diverted, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-COMP", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Completed Pat", Status = QueueStatus.Completed, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-CANC", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Cancelled Pat", Status = QueueStatus.Cancelled, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-NOSHOW", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "NoShow Pat", Status = QueueStatus.NoShow, CheckInTime = DateTime.UtcNow },
        };

        await context.Set<QueueItem>().AddRangeAsync(allPossibleStatusItems);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // Act: Default active queue query (Status = null, View = null)
        var result = await handler.Handle(new GetQueueQuery(Date: today), CancellationToken.None);

        // Assert: Exactly 6 active items returned
        result.Should().HaveCount(6);
        result.Select(r => r.PatientName).Should().BeEquivalentTo(new[]
        {
            "Waiting Pat",
            "Triaged Pat",
            "InConsult Pat",
            "PendingProc Pat",
            "ReEval Pat",
            "OnHold Pat"
        });

        // Strictly verify neither DischargedNonDoctor nor Diverted nor other terminal items are present
        result.Select(r => r.Status).Should().NotContain(QueueStatus.DischargedNonDoctor);
        result.Select(r => r.Status).Should().NotContain(QueueStatus.Diverted);
        result.Select(r => r.Status).Should().NotContain(QueueStatus.Completed);
        result.Select(r => r.Status).Should().NotContain(QueueStatus.Cancelled);
        result.Select(r => r.Status).Should().NotContain(QueueStatus.NoShow);
    }

    [Theory]
    [InlineData("MyRoom")]
    [InlineData("myroom")]
    [InlineData(" MYROOM ")]
    public async Task GetQueueQuery_MyRoomView_ExcludesDischargedNonDoctorAndDiverted_AcrossDoctorAndRoomFilters(string myRoomViewVariant)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var testDoctorId = Guid.NewGuid();
        var testRoomId = Guid.NewGuid();
        const string testStationName = "Room 3 - Dr. Santos";

        var items = new List<QueueItem>
        {
            // Active tickets assigned to this room/doctor
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, DoctorId = testDoctorId, RoomId = testRoomId, RoomOrStation = testStationName, QueueNumber = "Q-ACTIVE-1", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Active Room Waiting", Status = QueueStatus.Waiting, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, DoctorId = testDoctorId, RoomId = testRoomId, RoomOrStation = testStationName, QueueNumber = "Q-ACTIVE-2", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Active Room InConsult", Status = QueueStatus.InConsultation, CheckInTime = DateTime.UtcNow },

            // Terminal / Non-doctor discharged / Diverted assigned to this room/doctor
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, DoctorId = testDoctorId, RoomId = testRoomId, RoomOrStation = testStationName, QueueNumber = "Q-TERM-1", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Room Discharged NonDoctor", Status = QueueStatus.DischargedNonDoctor, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, DoctorId = testDoctorId, RoomId = testRoomId, RoomOrStation = testStationName, QueueNumber = "Q-TERM-2", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Room Diverted ER", Status = QueueStatus.Diverted, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, DoctorId = testDoctorId, RoomId = testRoomId, RoomOrStation = testStationName, QueueNumber = "Q-TERM-3", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Room Doctor Completed", Status = QueueStatus.Completed, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, DoctorId = testDoctorId, RoomId = testRoomId, RoomOrStation = testStationName, QueueNumber = "Q-TERM-4", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Room Cancelled", Status = QueueStatus.Cancelled, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, DoctorId = testDoctorId, RoomId = testRoomId, RoomOrStation = testStationName, QueueNumber = "Q-TERM-5", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Room NoShow", Status = QueueStatus.NoShow, CheckInTime = DateTime.UtcNow },

            // Active ticket assigned to a DIFFERENT room
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, DoctorId = Guid.NewGuid(), RoomId = Guid.NewGuid(), RoomOrStation = "Room 1", QueueNumber = "Q-OTHER", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Other Room Waiting", Status = QueueStatus.Waiting, CheckInTime = DateTime.UtcNow }
        };

        await context.Set<QueueItem>().AddRangeAsync(items);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // 1. Probe MyRoom by RoomId
        var queryByRoomId = new GetQueueQuery(Date: today, View: myRoomViewVariant, RoomId: testRoomId);
        var resRoomId = await handler.Handle(queryByRoomId, CancellationToken.None);
        resRoomId.Should().HaveCount(2);
        resRoomId.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "Active Room Waiting", "Active Room InConsult" });
        resRoomId.Select(r => r.Status).Should().NotContain(QueueStatus.DischargedNonDoctor);
        resRoomId.Select(r => r.Status).Should().NotContain(QueueStatus.Diverted);

        // 2. Probe MyRoom by DoctorId
        var queryByDoctorId = new GetQueueQuery(Date: today, View: myRoomViewVariant, DoctorId: testDoctorId);
        var resDocId = await handler.Handle(queryByDoctorId, CancellationToken.None);
        resDocId.Should().HaveCount(2);
        resDocId.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "Active Room Waiting", "Active Room InConsult" });
        resDocId.Select(r => r.Status).Should().NotContain(QueueStatus.DischargedNonDoctor);
        resDocId.Select(r => r.Status).Should().NotContain(QueueStatus.Diverted);

        // 3. Probe MyRoom by RoomOrStation string
        var queryByStationStr = new GetQueueQuery(Date: today, View: myRoomViewVariant, RoomOrStation: "  Room 3 - Dr. Santos  ");
        var resStationStr = await handler.Handle(queryByStationStr, CancellationToken.None);
        resStationStr.Should().HaveCount(2);
        resStationStr.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "Active Room Waiting", "Active Room InConsult" });
        resStationStr.Select(r => r.Status).Should().NotContain(QueueStatus.DischargedNonDoctor);
        resStationStr.Select(r => r.Status).Should().NotContain(QueueStatus.Diverted);
    }

    [Fact]
    public async Task GetQueueQuery_CompletedQueries_IncludeDischargedNonDoctor_AcrossStatusAndNamedView()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var items = new List<QueueItem>
        {
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Active Waiting", Status = QueueStatus.Waiting, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Doctor Consult Completed", Status = QueueStatus.Completed, CheckInTime = DateTime.UtcNow, CompletedTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-3", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Nurse Vitals Discharged", Status = QueueStatus.DischargedNonDoctor, CheckInTime = DateTime.UtcNow, DischargedAt = DateTime.UtcNow, DischargeNotes = "Normal vitals" },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-4", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Retail OTC Discharged", Status = QueueStatus.DischargedNonDoctor, CheckInTime = DateTime.UtcNow, DischargedAt = DateTime.UtcNow, DischargeNotes = "OTC items bought" },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-5", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Emergency Diverted", Status = QueueStatus.Diverted, CheckInTime = DateTime.UtcNow, DischargedAt = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-6", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Cancelled Visit", Status = QueueStatus.Cancelled, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-7", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "No Show Visit", Status = QueueStatus.NoShow, CheckInTime = DateTime.UtcNow }
        };

        await context.Set<QueueItem>().AddRangeAsync(items);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // 1. Probe Status = QueueStatus.Completed
        var queryByStatus = new GetQueueQuery(Date: today, Status: QueueStatus.Completed);
        var resultStatus = await handler.Handle(queryByStatus, CancellationToken.None);

        resultStatus.Should().HaveCount(3);
        resultStatus.Select(r => r.PatientName).Should().BeEquivalentTo(new[]
        {
            "Doctor Consult Completed",
            "Nurse Vitals Discharged",
            "Retail OTC Discharged"
        });
        resultStatus.Select(r => r.Status).Should().NotContain(QueueStatus.Diverted);
        resultStatus.Select(r => r.Status).Should().NotContain(QueueStatus.Cancelled);
        resultStatus.Select(r => r.Status).Should().NotContain(QueueStatus.NoShow);
        resultStatus.Select(r => r.Status).Should().NotContain(QueueStatus.Waiting);

        // 2. Probe View = "Completed"
        var queryByView = new GetQueueQuery(Date: today, View: "Completed");
        var resultView = await handler.Handle(queryByView, CancellationToken.None);

        resultView.Should().HaveCount(3);
        resultView.Select(r => r.PatientName).Should().BeEquivalentTo(new[]
        {
            "Doctor Consult Completed",
            "Nurse Vitals Discharged",
            "Retail OTC Discharged"
        });
        resultView.Select(r => r.Status).Should().NotContain(QueueStatus.Diverted);
        resultView.Select(r => r.Status).Should().NotContain(QueueStatus.Cancelled);
        resultView.Select(r => r.Status).Should().NotContain(QueueStatus.NoShow);

        // 3. Probe explicit Status = QueueStatus.DischargedNonDoctor (surgical filter)
        var queryByExplicitDischarged = new GetQueueQuery(Date: today, Status: QueueStatus.DischargedNonDoctor);
        var resultExplicit = await handler.Handle(queryByExplicitDischarged, CancellationToken.None);

        resultExplicit.Should().HaveCount(2);
        resultExplicit.Select(r => r.PatientName).Should().BeEquivalentTo(new[]
        {
            "Nurse Vitals Discharged",
            "Retail OTC Discharged"
        });
    }

    [Fact]
    public async Task GetQueueQuery_MultiTenantAndMultiClinicIsolation_ShieldsOtherClinicDischargedTickets()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var otherClinicId = Guid.NewGuid();

        var items = new List<QueueItem>
        {
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-MINE", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "My Clinic Discharged", Status = QueueStatus.DischargedNonDoctor, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = otherClinicId, QueueNumber = "Q-OTHER", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Other Clinic Discharged", Status = QueueStatus.DischargedNonDoctor, CheckInTime = DateTime.UtcNow }
        };

        await context.Set<QueueItem>().AddRangeAsync(items);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // Act: Query Completed items for current clinic
        var query = new GetQueueQuery(Date: today, Status: QueueStatus.Completed);
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert: Never leaks items belonging to otherClinicId
        result.Should().HaveCount(1);
        result[0].PatientName.Should().Be("My Clinic Discharged");
        result[0].ClinicId.Should().Be(_clinicId);
    }
}
