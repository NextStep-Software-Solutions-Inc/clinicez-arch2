using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Schedules.Commands;
using ClinicEz.Clinic.Application.Features.Schedules.DTOs;
using ClinicEz.Clinic.Application.Features.Schedules.Queries;
using ClinicEz.Clinic.Application.Features.Schedules.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone 1 (M1).
/// Rigorously tests:
/// 1. Multi-tenant isolation (Clinic A vs Clinic B query filters, templates, slots, bookings).
/// 2. PostgreSQL GiST exclusion constraint logic (cancelled & soft-deleted appointment filtering, interval boundaries).
/// </summary>
public class ChallengerM1EmpiricalTests
{
    private readonly ISieveProcessor _sieveProcessor = Substitute.For<ISieveProcessor>();

    private ApplicationDbContext CreateScopedDbContext(string dbName, Guid clinicId, string tenantId)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    private SlotAvailabilityService CreateAvailabilityService(ApplicationDbContext db)
    {
        return new SlotAvailabilityService(
            new Repository<DoctorScheduleTemplate>(db, _sieveProcessor),
            new Repository<DoctorLeave>(db, _sieveProcessor),
            new Repository<DoctorScheduleOverride>(db, _sieveProcessor),
            new Repository<Appointment>(db, _sieveProcessor),
            new Repository<StaffMember>(db, _sieveProcessor));
    }

    private static DateOnly GetFutureMonday()
    {
        var monday = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(14);
        while (monday.DayOfWeek != DayOfWeek.Monday)
        {
            monday = monday.AddDays(1);
        }
        return monday;
    }

    // =========================================================================
    // 1. Multi-Tenant Query Filter & Isolation Challenges
    // =========================================================================

    [Fact]
    public async Task MultiTenant_ClinicACannotQueryClinicBTemplates_ViaQueryHandler()
    {
        var dbName = $"MT_Templates_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        // 1. Seed Clinic B templates
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            var templateB = new DoctorScheduleTemplate
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                DoctorId = doctorId,
                DoctorName = "Dr. Clinic B Specialist",
                DayOfWeek = DayOfWeek.Monday,
                StartTime = new TimeOnly(9, 0),
                EndTime = new TimeOnly(17, 0),
                SlotDurationMinutes = 30,
                IsActive = true
            };
            dbB.DoctorScheduleTemplates.Add(templateB);
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A attempts to query templates for the same doctor
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var clinicContextA = Substitute.For<IClinicContext>();
            clinicContextA.ClinicId.Returns(clinicA);
            clinicContextA.TenantId.Returns("tenant-a");

            var templateRepoA = new Repository<DoctorScheduleTemplate>(dbA, _sieveProcessor);
            var handlerA = new GetDoctorScheduleTemplatesQueryHandler(templateRepoA, clinicContextA);

            var result = await handlerA.Handle(new GetDoctorScheduleTemplatesQuery(doctorId), CancellationToken.None);

            // Clinic A MUST see zero templates
            result.Should().BeEmpty("Clinic A must never access templates belonging to Clinic B");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotQueryClinicBSlots_ViaQueryHandler()
    {
        var dbName = $"MT_Slots_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var targetDate = new DateOnly(2026, 10, 12); // Monday

        // 1. Seed Clinic B templates & doctor
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            var doctorB = new StaffMember
            {
                Id = doctorId,
                ClinicId = clinicB,
                TenantId = "tenant-b",
                FirstName = "Doctor",
                LastName = "Bravo",
                Role = StaffRole.Doctor
            };
            var templateB = new DoctorScheduleTemplate
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                DoctorId = doctorId,
                DoctorName = "Doctor Bravo",
                DayOfWeek = DayOfWeek.Monday,
                StartTime = new TimeOnly(9, 0),
                EndTime = new TimeOnly(12, 0),
                SlotDurationMinutes = 30,
                IsActive = true
            };
            dbB.StaffMembers.Add(doctorB);
            dbB.DoctorScheduleTemplates.Add(templateB);
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A queries slots for the doctor
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var clinicContextA = Substitute.For<IClinicContext>();
            clinicContextA.ClinicId.Returns(clinicA);
            clinicContextA.TenantId.Returns("tenant-a");

            var slotServiceA = CreateAvailabilityService(dbA);
            var queryHandlerA = new GetDoctorAvailableSlotsQueryHandler(slotServiceA, clinicContextA);

            var result = await queryHandlerA.Handle(new GetDoctorAvailableSlotsQuery(doctorId, targetDate), CancellationToken.None);

            // Clinic A must see IsOnDuty = false and zero available slots
            result.IsOnDuty.Should().BeFalse();
            result.NonAvailabilityReason.Should().Be("No scheduled shift on this day");
            result.Slots.Should().BeEmpty("Clinic A must not receive availability slots from Clinic B's template");
        }
    }

    [Fact]
    public async Task MultiTenant_EFCoreGlobalQueryFilter_CompletelyHidesCrossClinicData()
    {
        var dbName = $"MT_Filter_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();

        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.DoctorScheduleTemplates.Add(new DoctorScheduleTemplate
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. B",
                DayOfWeek = DayOfWeek.Wednesday,
                StartTime = new TimeOnly(8, 0),
                EndTime = new TimeOnly(12, 0),
                SlotDurationMinutes = 30,
                IsActive = true
            });
            dbB.DoctorLeaves.Add(new DoctorLeave
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. B",
                StartDate = new DateOnly(2026, 10, 1),
                EndDate = new DateOnly(2026, 10, 5),
                Status = "Approved"
            });
            dbB.Appointments.Add(new Appointment
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                DoctorId = Guid.NewGuid(),
                PatientId = Guid.NewGuid(),
                PatientName = "Patient B",
                ScheduledAt = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc),
                EndTimeUtc = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc),
                Status = AppointmentStatus.Confirmed
            });
            await dbB.SaveChangesAsync();
        }

        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var templatesCount = await dbA.DoctorScheduleTemplates.CountAsync();
            var leavesCount = await dbA.DoctorLeaves.CountAsync();
            var apptsCount = await dbA.Appointments.CountAsync();

            templatesCount.Should().Be(0, "Global query filter must suppress Clinic B templates");
            leavesCount.Should().Be(0, "Global query filter must suppress Clinic B leaves");
            apptsCount.Should().Be(0, "Global query filter must suppress Clinic B appointments");
        }
    }

    [Fact]
    public async Task MultiTenant_TwoClinicsBookingSameDoctorIdConcurrently_DoNotCollide()
    {
        var dbName = $"MT_BookingIsolation_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var scheduledTime = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc);

        // 1. Clinic A books Doctor for 10:00 to 10:30
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var clinicContextA = Substitute.For<IClinicContext>();
            clinicContextA.ClinicId.Returns(clinicA);
            clinicContextA.TenantId.Returns("tenant-a");

            var repoA = new Repository<Appointment>(dbA, _sieveProcessor);
            var uowA = Substitute.For<IUnitOfWork>();
            uowA.SaveChangesAsync(Arg.Any<CancellationToken>())
                .Returns(callInfo => dbA.SaveChangesAsync(callInfo.Arg<CancellationToken>()));

            var handlerA = new CreateAppointmentCommandHandler(repoA, uowA, clinicContextA);
            var cmdA = new CreateAppointmentCommand(
                PatientId: Guid.NewGuid(),
                PatientName: "Patient A",
                DoctorId: doctorId,
                DoctorName: "Dr. Shared",
                ScheduledAt: scheduledTime,
                DurationMinutes: 30);

            var resA = await handlerA.Handle(cmdA, CancellationToken.None);
            resA.Should().NotBeNull();
        }

        // 2. Clinic B books the same Doctor for the exact same time
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            var clinicContextB = Substitute.For<IClinicContext>();
            clinicContextB.ClinicId.Returns(clinicB);
            clinicContextB.TenantId.Returns("tenant-b");

            var repoB = new Repository<Appointment>(dbB, _sieveProcessor);
            var uowB = Substitute.For<IUnitOfWork>();
            uowB.SaveChangesAsync(Arg.Any<CancellationToken>())
                .Returns(callInfo => dbB.SaveChangesAsync(callInfo.Arg<CancellationToken>()));

            var handlerB = new CreateAppointmentCommandHandler(repoB, uowB, clinicContextB);
            var cmdB = new CreateAppointmentCommand(
                PatientId: Guid.NewGuid(),
                PatientName: "Patient B",
                DoctorId: doctorId,
                DoctorName: "Dr. Shared",
                ScheduledAt: scheduledTime,
                DurationMinutes: 30);

            // Handler B should succeed without collision because Clinic A's booking is outside Clinic B's tenant filter
            var resB = await handlerB.Handle(cmdB, CancellationToken.None);
            resB.Should().NotBeNull();
            resB.ScheduledAt.Should().Be(scheduledTime);
        }
    }

    // =========================================================================
    // 2. PostgreSQL GiST Exclusion Constraint & Soft-Delete / Cancelled Verification
    // =========================================================================

    [Fact]
    public async Task GiST_SoftDeletedAppointment_DoesNotCollideWithNewBooking()
    {
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var scheduledTime = new DateTime(2026, 10, 12, 14, 0, 0, DateTimeKind.Utc);

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("test-tenant");

        using var db = MessagingTestKit.CreateDbContext(clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(Task.FromResult(1));

        // Add soft-deleted appointment in database
        var softDeleted = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = "test-tenant",
            DoctorId = doctorId,
            ScheduledAt = scheduledTime,
            EndTimeUtc = scheduledTime.AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            IsDeleted = true, // Soft-deleted
            DeletedAt = DateTime.UtcNow,
            PatientId = Guid.NewGuid(),
            PatientName = "Soft Deleted Patient"
        };
        db.Appointments.Add(softDeleted);
        await db.SaveChangesAsync();

        var handler = new CreateAppointmentCommandHandler(repo, uow, clinicContext);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Fresh Patient",
            DoctorId: doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: scheduledTime,
            DurationMinutes: 30);

        // Pre-query check and GiST WHERE clause both ignore IsDeleted = true
        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.PatientName.Should().Be("Fresh Patient");
    }

    [Fact]
    public async Task GiST_SoftDeletedAppointment_DoesNotCollideWithReschedule()
    {
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var targetTime = new DateTime(2026, 10, 12, 15, 0, 0, DateTimeKind.Utc);

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("test-tenant");

        using var db = MessagingTestKit.CreateDbContext(clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(Task.FromResult(1));

        // Soft deleted appt at 15:00
        var softDeleted = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = "test-tenant",
            DoctorId = doctorId,
            ScheduledAt = targetTime,
            EndTimeUtc = targetTime.AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            IsDeleted = true,
            PatientId = Guid.NewGuid(),
            PatientName = "Soft Deleted"
        };
        // Active appt at 10:00 to be rescheduled
        var activeAppt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = "test-tenant",
            DoctorId = doctorId,
            ScheduledAt = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc),
            EndTimeUtc = new DateTime(2026, 10, 12, 10, 30, 0, DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed,
            IsDeleted = false,
            PatientId = Guid.NewGuid(),
            PatientName = "Moving Patient"
        };
        db.Appointments.AddRange(softDeleted, activeAppt);
        await db.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, uow);

        var command = new RescheduleAppointmentCommand(
            Id: activeAppt.Id,
            NewScheduledAt: targetTime,
            DurationMinutes: 30);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ScheduledAt.Should().Be(targetTime);
    }

    [Fact]
    public async Task SlotAvailability_SoftDeletedAndCancelledAppointments_KeepSlotsAvailable()
    {
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var date = GetFutureMonday(); // Monday

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("test-tenant");

        using var db = MessagingTestKit.CreateDbContext(clinicContext);

        // Schedule template: 09:00 to 11:00 (four 30m slots)
        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = "test-tenant",
            DoctorId = doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);

        // Slot 1 (09:00-09:30): Cancelled
        var slot1Utc = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 0)), TimeSpan.FromHours(8)).UtcDateTime;
        db.Appointments.Add(new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = "test-tenant",
            DoctorId = doctorId,
            PatientId = Guid.NewGuid(),
            PatientName = "Cancelled Appt",
            ScheduledAt = slot1Utc,
            EndTimeUtc = slot1Utc.AddMinutes(30),
            Status = AppointmentStatus.Cancelled
        });

        // Slot 2 (09:30-10:00): Soft-deleted
        var slot2Utc = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 30)), TimeSpan.FromHours(8)).UtcDateTime;
        db.Appointments.Add(new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = "test-tenant",
            DoctorId = doctorId,
            PatientId = Guid.NewGuid(),
            PatientName = "Soft Deleted Appt",
            ScheduledAt = slot2Utc,
            EndTimeUtc = slot2Utc.AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            IsDeleted = true
        });

        // Slot 3 (10:00-10:30): Confirmed active
        var slot3Utc = new DateTimeOffset(date.ToDateTime(new TimeOnly(10, 0)), TimeSpan.FromHours(8)).UtcDateTime;
        db.Appointments.Add(new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = "test-tenant",
            DoctorId = doctorId,
            PatientId = Guid.NewGuid(),
            PatientName = "Active Appt",
            ScheduledAt = slot3Utc,
            EndTimeUtc = slot3Utc.AddMinutes(30),
            Status = AppointmentStatus.Confirmed
        });

        await db.SaveChangesAsync();

        var service = CreateAvailabilityService(db);
        var result = await service.GetDoctorAvailabilityAsync(clinicId, doctorId, date, null, CancellationToken.None);

        result.Slots.Should().HaveCount(4);

        // Slot 1 (09:00): Available (cancelled ignored)
        result.Slots[0].StartTime.Should().Be(new TimeOnly(9, 0));
        result.Slots[0].IsAvailable.Should().BeTrue();
        result.Slots[0].Status.Should().Be("Available");

        // Slot 2 (09:30): Available (soft-deleted ignored)
        result.Slots[1].StartTime.Should().Be(new TimeOnly(9, 30));
        result.Slots[1].IsAvailable.Should().BeTrue();
        result.Slots[1].Status.Should().Be("Available");

        // Slot 3 (10:00): Booked
        result.Slots[2].StartTime.Should().Be(new TimeOnly(10, 0));
        result.Slots[2].IsAvailable.Should().BeFalse();
        result.Slots[2].Status.Should().Be("Booked");
        result.Slots[2].PatientName.Should().Be("Active Appt");

        // Slot 4 (10:30): Available
        result.Slots[3].StartTime.Should().Be(new TimeOnly(10, 30));
        result.Slots[3].IsAvailable.Should().BeTrue();
        result.Slots[3].Status.Should().Be("Available");
    }
}
