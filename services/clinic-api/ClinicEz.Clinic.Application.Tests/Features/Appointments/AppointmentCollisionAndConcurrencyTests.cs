using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Appointments;

public class AppointmentCollisionAndConcurrencyTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;
    private readonly ISieveProcessor _sieveProcessor;

    public AppointmentCollisionAndConcurrencyTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns("test-tenant");

        _sieveProcessor = Substitute.For<ISieveProcessor>();
    }

    [Fact]
    public async Task CreateAppointment_OverlappingSlot_ThrowsConflictException_ViaPreQuery()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();

        var existingStart = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var existingEnd = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var existing = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            ScheduledAt = existingStart,
            EndTimeUtc = existingEnd,
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Existing Patient"
        };
        db.Appointments.Add(existing);
        await db.SaveChangesAsync();

        var handler = new CreateAppointmentCommandHandler(repo, unitOfWork, _clinicContext);

        // Attempt overlapping slot: 09:15 to 09:45
        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "New Patient",
            DoctorId: _doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: new DateTime(2026, 10, 12, 9, 15, 0, DateTimeKind.Utc),
            DurationMinutes: 30);

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already has an appointment during this time window*");
    }

    [Fact]
    public async Task CreateAppointment_AdjacentContiguousSlot_Succeeds()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();
        unitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(Task.FromResult(1));

        var existingStart = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var existingEnd = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var existing = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            ScheduledAt = existingStart,
            EndTimeUtc = existingEnd,
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Existing Patient"
        };
        db.Appointments.Add(existing);
        await db.SaveChangesAsync();

        var handler = new CreateAppointmentCommandHandler(repo, unitOfWork, _clinicContext);

        // Contiguous adjacent slot: 09:30 to 10:00 (half-open interval [09:00, 09:30) and [09:30, 10:00))
        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Adjacent Patient",
            DoctorId: _doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc),
            DurationMinutes: 30);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ScheduledAt.Should().Be(new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc));
    }

    [Fact]
    public async Task CreateAppointment_DifferentDoctorSameTime_Succeeds()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();
        unitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(Task.FromResult(1));

        var otherDoctorId = Guid.NewGuid();
        var time = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);

        var existing = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = otherDoctorId,
            ScheduledAt = time,
            EndTimeUtc = time.AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Other Patient"
        };
        db.Appointments.Add(existing);
        await db.SaveChangesAsync();

        var handler = new CreateAppointmentCommandHandler(repo, unitOfWork, _clinicContext);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Patient For Doctor Santos",
            DoctorId: _doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: time,
            DurationMinutes: 30);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.DoctorId.Should().Be(_doctorId);
    }

    [Fact]
    public async Task CreateAppointment_CancelledExistingAppointment_DoesNotCollide()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();
        unitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(Task.FromResult(1));

        var time = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);

        var cancelled = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            ScheduledAt = time,
            EndTimeUtc = time.AddMinutes(30),
            Status = AppointmentStatus.Cancelled,
            PatientId = Guid.NewGuid(),
            PatientName = "Cancelled Patient"
        };
        db.Appointments.Add(cancelled);
        await db.SaveChangesAsync();

        var handler = new CreateAppointmentCommandHandler(repo, unitOfWork, _clinicContext);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "New Patient",
            DoctorId: _doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: time,
            DurationMinutes: 30);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.PatientName.Should().Be("New Patient");
    }

    [Fact]
    public async Task CreateAppointment_PostgresExclusionViolation_Catches23P01AndThrowsConflictException()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();

        // Simulate concurrent race condition where DB throws PostgresException with SqlState 23P01
        var postgresEx = new Npgsql.PostgresException("exclusion_violation", "ERROR", "ERROR", "23P01");
        var dbEx = new DbUpdateException("Exclusion violation occurred", postgresEx);

        unitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>())
            .Returns<Task<int>>(_ => throw dbEx);

        var handler = new CreateAppointmentCommandHandler(repo, unitOfWork, _clinicContext);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Concurrent Patient",
            DoctorId: _doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: new DateTime(2026, 10, 12, 14, 0, 0, DateTimeKind.Utc),
            DurationMinutes: 30);

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already has an appointment during this time window*");
    }

    [Fact]
    public async Task RescheduleAppointment_OverlappingSlot_ThrowsConflictException()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();

        var appt1 = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            ScheduledAt = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc),
            EndTimeUtc = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 1"
        };
        var appt2 = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            ScheduledAt = new DateTime(2026, 10, 12, 11, 0, 0, DateTimeKind.Utc),
            EndTimeUtc = new DateTime(2026, 10, 12, 11, 30, 0, DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 2"
        };
        db.Appointments.AddRange(appt1, appt2);
        await db.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, unitOfWork);

        // Attempt to reschedule appt2 into appt1's slot (09:15 to 09:45)
        var command = new RescheduleAppointmentCommand(
            Id: appt2.Id,
            NewScheduledAt: new DateTime(2026, 10, 12, 9, 15, 0, DateTimeKind.Utc),
            DurationMinutes: 30,
            Reason: "Patient conflict");

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already has an appointment during this time window*");
    }

    [Fact]
    public async Task RescheduleAppointment_PostgresExclusionViolation_Catches23P01AndThrowsConflictException()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();

        var appt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            ScheduledAt = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc),
            EndTimeUtc = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 1"
        };
        db.Appointments.Add(appt);
        await db.SaveChangesAsync();

        var postgresEx = new Npgsql.PostgresException("exclusion_violation", "ERROR", "ERROR", "23P01");
        var dbEx = new DbUpdateException("Exclusion violation occurred", postgresEx);

        unitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>())
            .Returns<Task<int>>(_ => throw dbEx);

        var handler = new RescheduleAppointmentCommandHandler(repo, unitOfWork);

        var command = new RescheduleAppointmentCommand(
            Id: appt.Id,
            NewScheduledAt: new DateTime(2026, 10, 12, 14, 0, 0, DateTimeKind.Utc),
            DurationMinutes: 30);

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already has an appointment during this time window*");
    }

    [Fact]
    public async Task CreateAppointment_ExactIdenticalSlot_ThrowsConflictException()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();

        var time = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc);

        var existing = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            ScheduledAt = time,
            EndTimeUtc = time.AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "First Patient"
        };
        db.Appointments.Add(existing);
        await db.SaveChangesAsync();

        var handler = new CreateAppointmentCommandHandler(repo, unitOfWork, _clinicContext);

        // Exact identical slot requested for the same doctor
        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Second Patient",
            DoctorId: _doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: time,
            DurationMinutes: 30);

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already has an appointment during this time window*");
    }

    [Fact]
    public async Task CreateAppointment_UnassignedAppointments_SameTime_DoNotCollide()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();
        unitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(Task.FromResult(1));

        var time = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc);

        // Existing unassigned appointment (walk-in / triage queue)
        var existingUnassigned = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = null,
            ScheduledAt = time,
            EndTimeUtc = time.AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Unassigned Walk-In 1"
        };
        db.Appointments.Add(existingUnassigned);
        await db.SaveChangesAsync();

        var handler = new CreateAppointmentCommandHandler(repo, unitOfWork, _clinicContext);

        // Second unassigned appointment at the exact same time
        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Unassigned Walk-In 2",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: time,
            DurationMinutes: 30);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.DoctorId.Should().BeNull();
        result.PatientName.Should().Be("Unassigned Walk-In 2");
    }

    [Fact]
    public async Task RescheduleAppointment_ExactIdenticalSlot_ThrowsConflictException()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();

        var appt1 = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            ScheduledAt = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc),
            EndTimeUtc = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 1"
        };
        var appt2 = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            ScheduledAt = new DateTime(2026, 10, 12, 14, 0, 0, DateTimeKind.Utc),
            EndTimeUtc = new DateTime(2026, 10, 12, 14, 30, 0, DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 2"
        };
        db.Appointments.AddRange(appt1, appt2);
        await db.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, unitOfWork);

        // Reschedule appt2 to exact same slot as appt1 (09:00 to 09:30)
        var command = new RescheduleAppointmentCommand(
            Id: appt2.Id,
            NewScheduledAt: new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc),
            DurationMinutes: 30);

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already has an appointment during this time window*");
    }

    [Fact]
    public async Task RescheduleAppointment_UnassignedAppointments_SameTime_DoNotCollide()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var unitOfWork = Substitute.For<IUnitOfWork>();
        unitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(Task.FromResult(1));

        var targetTime = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);

        var appt1 = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = null,
            ScheduledAt = targetTime,
            EndTimeUtc = targetTime.AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Unassigned 1"
        };
        var appt2 = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = null,
            ScheduledAt = new DateTime(2026, 10, 12, 14, 0, 0, DateTimeKind.Utc),
            EndTimeUtc = new DateTime(2026, 10, 12, 14, 30, 0, DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed,
            PatientId = Guid.NewGuid(),
            PatientName = "Unassigned 2"
        };
        db.Appointments.AddRange(appt1, appt2);
        await db.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, unitOfWork);

        // Reschedule appt2 (DoctorId == null) to targetTime where appt1 (DoctorId == null) is already booked
        var command = new RescheduleAppointmentCommand(
            Id: appt2.Id,
            NewScheduledAt: targetTime,
            DurationMinutes: 30);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.DoctorId.Should().BeNull();
        result.ScheduledAt.Should().Be(targetTime);
    }
}

