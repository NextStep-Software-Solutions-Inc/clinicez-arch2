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
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class CheckInPatientCommandHandlerTests
{
    [Fact]
    public async Task Handle_WalkInCheckIn_GeneratesDailyTicketNumber_AndDispatchesWebhook()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var webhookNotifier = Substitute.For<IPatientWebhookNotifier>();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, clinicContext, webhookNotifier);

        var command = new CheckInPatientCommand(
            patientId,
            "Juan Dela Cruz",
            null,
            null,
            null,
            QueuePriority.Urgent,
            "Acute fever and chills"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.QueueNumber.Should().Be("Q-001");
        result.SequenceNumber.Should().Be(1);
        result.Priority.Should().Be(QueuePriority.Urgent);
        result.Status.Should().Be(QueueStatus.Waiting);

        var saved = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == result.Id);
        saved.Should().NotBeNull();
        saved!.QueueNumber.Should().Be("Q-001");
        saved.PatientName.Should().Be("Juan Dela Cruz");

        // Verify outbound webhook notification pushed to patient-api
        await webhookNotifier.Received(1).PushAppointmentUpdateAsync(
            Arg.Is<ClinicPushAppointmentsPayload>(p =>
                p.ClinicId == clinicId &&
                p.PatientId == patientId &&
                p.Appointments.Count == 1 &&
                p.Appointments[0].Status == AppointmentStatus.CheckedIn.ToString()),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_ScheduledAppointmentCheckIn_UpdatesAppointmentStatus()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var apptId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var webhookNotifier = Substitute.For<IPatientWebhookNotifier>();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var existingAppt = new Appointment
        {
            Id = apptId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Maria Santos",
            Status = AppointmentStatus.Confirmed,
            DoctorName = "Dr. Cruz",
            ScheduledAt = DateTime.UtcNow
        };
        await context.Appointments.AddAsync(existingAppt);
        await context.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, clinicContext, webhookNotifier);

        var command = new CheckInPatientCommand(
            patientId,
            "Maria Santos",
            apptId,
            null,
            "Dr. Cruz",
            QueuePriority.Routine,
            "Hypertension consultation"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.AppointmentId.Should().Be(apptId);

        var updated = await context.Appointments.FirstAsync(a => a.Id == apptId);
        updated.Status.Should().Be(AppointmentStatus.CheckedIn);
    }
}
