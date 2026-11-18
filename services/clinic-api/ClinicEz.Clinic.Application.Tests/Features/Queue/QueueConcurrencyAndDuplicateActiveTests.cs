using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class QueueConcurrencyAndDuplicateActiveTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_concurrency_test";

    public QueueConcurrencyAndDuplicateActiveTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task CheckIn_WhenPatientAlreadyHasActiveClinicalTicket_ThrowsActiveQueueTicketConflictException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Pre-existing active Consultation ticket
        var activeTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = patientId,
            PatientName = "Abellana, Bea M.",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.RoutineCheckup,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(activeTicket);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        // Act: Attempt to check in for Procedure without AllowDuplicateActive
        var procedureCommand = new CheckInPatientCommand(
            PatientId: patientId,
            PatientName: "Abellana, Bea M.",
            VisitType: VisitType.PreventiveHealthAssessment,
            AllowDuplicateActive: false);

        var act = () => handler.Handle(procedureCommand, CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<ActiveQueueTicketConflictException>();
        ex.Which.QueueNumber.Should().Be("Q-001");
        ex.Which.PatientName.Should().Be("Abellana, Bea M.");
    }

    [Fact]
    public async Task CheckIn_WhenStaffConfirmsContinue_AllowsDuplicateActiveTicket()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Pre-existing active ticket
        var activeTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = patientId,
            PatientName = "Abellana, Bea M.",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.RoutineCheckup,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(activeTicket);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        // Act: Check in with AllowDuplicateActive = true (staff confirmed continuing)
        var procedureCommand = new CheckInPatientCommand(
            PatientId: patientId,
            PatientName: "Abellana, Bea M.",
            VisitType: VisitType.PreventiveHealthAssessment,
            SeriesPrefix: "P",
            AllowDuplicateActive: true);

        var result = await handler.Handle(procedureCommand, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.QueueNumber.Should().Be("P-001");
        result.VisitType.Should().Be(VisitType.PreventiveHealthAssessment);
    }

    [Fact]
    public async Task CallQueueItem_WhenAlreadyInConsultationWithAnotherDoctor_ThrowsConflictException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var doc1Id = Guid.NewGuid();
        var doc2Id = Guid.NewGuid();

        var inConsultTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Concurrency",
            Status = QueueStatus.InConsultation,
            DoctorId = doc1Id,
            DoctorName = "Dr. Jose Rizal",
            RoomOrStation = "Room 1",
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(inConsultTicket);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CallQueueItemCommandHandler(queueRepo, uow, _clinicContext);

        // Act: Doctor 2 attempts to call the same ticket
        var callCommand = new CallQueueItemCommand(
            Id: inConsultTicket.Id,
            DoctorId: doc2Id,
            DoctorName: "Dr. Justine Mae Tabasan",
            RoomOrStation: "Room 2");

        var act = () => handler.Handle(callCommand, CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<ConflictException>();
        ex.Which.Message.Should().Contain("Dr. Jose Rizal");
    }
}
