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
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class CheckInPatientCommandHandlerTests
{
    private static IClinicIdentityProvider IdentityOf(Guid clinicId, string tenantId)
    {
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns(new ClinicIdentity(tenantId, clinicId, "Apex Clinic"));
        return identity;
    }

    [Fact]
    public async Task Handle_WalkInCheckIn_GeneratesDailyTicketNumber_AndPublishesAppointmentUpdate()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var appointmentPublisher = Substitute.For<IPatientAppointmentPublisher>();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, clinicContext, IdentityOf(clinicId, tenantId), appointmentPublisher);

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

        // Verify the patient-app notification is handed to the publisher with the real clinic name
        await appointmentPublisher.Received(1).PublishAppointmentUpdatedAsync(
            Arg.Is<ClinicPushAppointmentsPayload>(p =>
                p.ClinicId == clinicId &&
                p.PatientId == patientId &&
                p.Appointments.Count == 1 &&
                p.Appointments[0].ClinicName == "Apex Clinic" &&
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

        var appointmentPublisher = Substitute.For<IPatientAppointmentPublisher>();
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

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, clinicContext, IdentityOf(clinicId, tenantId), appointmentPublisher);

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

    [Fact]
    public async Task Handle_PatientWithAppAccount_QueuesAppointmentUpdateInTheSameSaveAsTheCheckIn()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicPatientId = Guid.NewGuid();
        var patientAppAccountId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var apptId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        MessagingTestKit.SeedClinic(context, clinicId, tenantId, "Apex Clinic");
        context.Patients.Add(new Patient
        {
            Id = clinicPatientId,
            CloudPatientId = patientAppAccountId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-1",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "0917"
        });
        context.Appointments.Add(new Appointment
        {
            Id = apptId,
            DraftId = draftId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = clinicPatientId,
            PatientName = "Maria Santos",
            Status = AppointmentStatus.Confirmed,
            ScheduledAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var probe = new MessagingTestKit.SaveProbe();
        var publisher = new PatientAppointmentPublisher(
            new InteropPublisher(context), MessagingTestKit.Addresses(context), NullLogger<PatientAppointmentPublisher>.Instance);
        var handler = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            probe.Wrap(context, uow),
            clinicContext,
            new ClinicIdentityProvider(context, clinicContext),
            publisher);

        // Act
        await handler.Handle(new CheckInPatientCommand(
            clinicPatientId, "Maria Santos", apptId, null, null, QueuePriority.Routine, "Cough"), CancellationToken.None);

        // Assert: one commit carried the check-in and the queued message
        probe.Saves.Should().ContainSingle();
        probe.Saves[0].PendingOutbox.Should().Be(1);
        probe.Saves[0].PendingBusiness.Should().BeGreaterThan(0);

        var row = await context.InteropOutbox.SingleAsync();
        row.Type.Should().Be(InteropTypes.ClinicAppointmentUpdated);
        row.CorrelationId.Should().Be(apptId);

        var envelope = InteropEnvelope.FromJson(row.EnvelopeJson);
        envelope.From.TenantId.Should().Be(tenantId);
        envelope.From.FacilityId.Should().Be(clinicId.ToString());
        envelope.To.Kind.Should().Be(PartyKind.Patient);
        envelope.To.PatientId.Should().Be(patientAppAccountId.ToString());

        var update = envelope.GetPayload<ClinicAppointmentUpdatedEvent>();
        update.PatientId.Should().Be(patientAppAccountId);
        update.ClinicId.Should().Be(clinicId);
        update.Appointments.Should().ContainSingle();
        update.Appointments[0].Status.Should().Be(AppointmentStatus.CheckedIn.ToString());
        update.Appointments[0].ClinicName.Should().Be("Apex Clinic");
        update.Appointments[0].DraftId.Should().Be(draftId);
    }

    [Fact]
    public async Task Handle_PatientWithoutAppAccount_QueuesNothing()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        MessagingTestKit.SeedClinic(context, clinicId, tenantId);
        var walkIn = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-2",
            FirstName = "Walk",
            LastName = "In",
            ContactNumber = "0918"
        };
        context.Patients.Add(walkIn);
        await context.SaveChangesAsync();

        var publisher = new PatientAppointmentPublisher(
            new InteropPublisher(context), MessagingTestKit.Addresses(context), NullLogger<PatientAppointmentPublisher>.Instance);
        var handler = new CheckInPatientCommandHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Appointment>(context, sieve),
            uow,
            clinicContext,
            new ClinicIdentityProvider(context, clinicContext),
            publisher);

        var result = await handler.Handle(new CheckInPatientCommand(
            walkIn.Id, "Walk In", null, null, null, QueuePriority.Routine, "Cough"), CancellationToken.None);

        result.QueueNumber.Should().Be("Q-001");
        (await context.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public void CheckInPatientCommand_ShouldDeserializeFromJson_Successfully()
    {
        var json = """
        {
            "patientId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
            "patientName": "Juan Dela Cruz",
            "appointmentId": null,
            "doctorId": null,
            "doctorName": null,
            "priority": 1,
            "chiefComplaint": "Headache",
            "roomOrStation": "Room 1",
            "roomId": "8c2deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e"
        }
        """;

        var options = new System.Text.Json.JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        var command = System.Text.Json.JsonSerializer.Deserialize<CheckInPatientCommand>(json, options);

        command.Should().NotBeNull();
        command!.PatientId.Should().Be(Guid.Parse("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"));
        command.PatientName.Should().Be("Juan Dela Cruz");
        command.ChiefComplaint.Should().Be("Headache");
        command.RoomOrStation.Should().Be("Room 1");
        command.RoomId.Should().Be(Guid.Parse("8c2deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e"));
    }
}
