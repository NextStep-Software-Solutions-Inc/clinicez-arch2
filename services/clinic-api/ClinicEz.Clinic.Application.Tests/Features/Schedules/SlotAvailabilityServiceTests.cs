using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Schedules.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using FluentAssertions;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Schedules;

public class SlotAvailabilityServiceTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;
    private readonly ISieveProcessor _sieveProcessor;

    public SlotAvailabilityServiceTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns("test-tenant");

        _sieveProcessor = Substitute.For<ISieveProcessor>();
    }

    private SlotAvailabilityService CreateService(ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext db)
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

    [Fact]
    public async Task GetDoctorAvailabilityAsync_NoTemplateConfigured_ReturnsEmptySlots()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var service = CreateService(db);

        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, GetFutureMonday(), null, CancellationToken.None);

        result.DoctorId.Should().Be(_doctorId);
        result.Slots.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_RegularShift_GeneratesCorrectSlots()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(12, 0),
            SlotDurationMinutes = 30,
            IsOvernightShift = false,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        // 9:00 to 12:00 with 30m slots => 6 slots (09:00, 09:30, 10:00, 10:30, 11:00, 11:30)
        result.Slots.Should().HaveCount(6);
        result.Slots.Should().OnlyContain(s => s.IsAvailable && s.Status == "Available");
        result.Slots.Select(s => s.StartTime.ToString("HH:mm")).Should().ContainInOrder("09:00", "09:30", "10:00", "10:30", "11:00", "11:30");
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_WithBreaks_MarksBreakSlotsUnavailable()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(13, 0),
            SlotDurationMinutes = 30,
            IsOvernightShift = false,
            IsActive = true
        };
        var breakTime = new DoctorBreakTime
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Description = "Lunch Break",
            StartTime = new TimeOnly(11, 0),
            EndTime = new TimeOnly(12, 0)
        };
        template.BreakTimes.Add(breakTime);
        db.DoctorScheduleTemplates.Add(template);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        result.Slots.Should().HaveCount(8);
        var breakSlots = result.Slots.Where(s => !s.IsAvailable).ToList();
        breakSlots.Should().HaveCount(2);
        breakSlots.Select(s => s.StartTime.ToString("HH:mm")).Should().ContainInOrder("11:00", "11:30");
        breakSlots.Should().OnlyContain(s => s.Status == "Break" && s.Notes != null && s.Notes.Contains("Lunch Break"));
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_ApprovedLeave_MarksOverlappingSlotsUnavailable()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(13, 0),
            SlotDurationMinutes = 30,
            IsOvernightShift = false,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);

        var leave = new DoctorLeave
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            StartDate = date,
            EndDate = date,
            PartialDayStartTime = new TimeOnly(10, 0),
            PartialDayEndTime = new TimeOnly(12, 0),
            Reason = "Medical Conference",
            Status = "Approved"
        };
        db.DoctorLeaves.Add(leave);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        var unavailableSlots = result.Slots.Where(s => !s.IsAvailable).ToList();
        unavailableSlots.Should().HaveCount(4); // 10:00, 10:30, 11:00, 11:30
        unavailableSlots.Should().OnlyContain(s => s.Status == "OnLeave" && s.Notes != null && s.Notes.Contains("Medical Conference"));

        var availableSlots = result.Slots.Where(s => s.IsAvailable).ToList();
        availableSlots.Should().HaveCount(4); // 09:00, 09:30, 12:00, 12:30
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_UnapprovedLeave_DoesNotBlockSlots()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            SlotDurationMinutes = 30,
            IsOvernightShift = false,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);

        var pendingLeave = new DoctorLeave
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            StartDate = date,
            EndDate = date,
            Reason = "Pending Vacation",
            Status = "Pending"
        };
        db.DoctorLeaves.Add(pendingLeave);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        result.Slots.Should().HaveCount(4);
        result.Slots.Should().OnlyContain(s => s.IsAvailable);
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_ExistingAppointment_MarksSlotUnavailable()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            SlotDurationMinutes = 30,
            IsOvernightShift = false,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);

        // Manila is UTC+8. Local 09:30 Manila = 01:30 UTC
        var scheduledAtUtc = date.ToDateTime(new TimeOnly(9, 30), DateTimeKind.Unspecified).AddHours(-8);
        var existingAppointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            ScheduledAt = DateTime.SpecifyKind(scheduledAtUtc, DateTimeKind.Utc),
            EndTimeUtc = DateTime.SpecifyKind(scheduledAtUtc.AddMinutes(30), DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed
        };
        db.Appointments.Add(existingAppointment);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        result.Slots.Should().HaveCount(4);
        var bookedSlot = result.Slots.Single(s => !s.IsAvailable);
        bookedSlot.StartTime.Should().Be(new TimeOnly(9, 30));
        bookedSlot.Status.Should().Be("Booked");
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_CancelledAppointment_DoesNotBlockSlot()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            SlotDurationMinutes = 30,
            IsOvernightShift = false,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);

        var scheduledAtUtc = date.ToDateTime(new TimeOnly(9, 30), DateTimeKind.Unspecified).AddHours(-8);
        var cancelledAppointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            PatientId = Guid.NewGuid(),
            PatientName = "Cancelled Patient",
            ScheduledAt = DateTime.SpecifyKind(scheduledAtUtc, DateTimeKind.Utc),
            EndTimeUtc = DateTime.SpecifyKind(scheduledAtUtc.AddMinutes(30), DateTimeKind.Utc),
            Status = AppointmentStatus.Cancelled
        };
        db.Appointments.Add(cancelledAppointment);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        result.Slots.Should().HaveCount(4);
        result.Slots.Should().OnlyContain(s => s.IsAvailable);
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_DateSpecificOverride_NotWorking_ReturnsNoSlots()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(12, 0),
            SlotDurationMinutes = 30,
            IsOvernightShift = false,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);

        var dateOverride = new DoctorScheduleOverride
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            Date = date,
            IsWorking = false,
            Reason = "Special Clinic Holiday"
        };
        db.DoctorScheduleOverrides.Add(dateOverride);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        result.Slots.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_MultiTenantIsolation_IgnoresOtherClinicTemplates()
    {
        var otherClinicId = Guid.NewGuid();
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var otherTemplate = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = otherClinicId,
            TenantId = "other-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(17, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(otherTemplate);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        result.Slots.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_OvernightShift_GeneratesRolloverSlotsNextDay()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var mondayDate = GetFutureMonday();
        var sundayDate = mondayDate.AddDays(-1);

        // Sunday night shift: 22:00 to 02:00 (spans into Monday 00:00 to 02:00)
        var sundayTemplate = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Sunday,
            StartTime = new TimeOnly(22, 0),
            EndTime = new TimeOnly(2, 0),
            SlotDurationMinutes = 60,
            IsOvernightShift = true,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(sundayTemplate);
        await db.SaveChangesAsync();

        var service = CreateService(db);

        // Query on Sunday: 22:00 and 23:00
        var sundayResult = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, sundayDate, null, CancellationToken.None);
        sundayResult.Slots.Select(s => s.StartTime.ToString("HH:mm")).Should().ContainInOrder("22:00", "23:00");

        // Query on Monday: rollover slots from Sunday: 00:00 and 01:00
        var mondayResult = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, mondayDate, null, CancellationToken.None);
        mondayResult.Slots.Select(s => s.StartTime.ToString("HH:mm")).Should().ContainInOrder("00:00", "01:00");
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_ClinicWideBlackoutLeave_ReturnsNoSlots()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(17, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);

        // Clinic-wide blackout (DoctorId == null)
        var clinicClosure = new DoctorLeave
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = null,
            DoctorName = "All Doctors (Clinic-wide)",
            StartDate = date,
            EndDate = date,
            Reason = "National Heroes Day (Clinic Closed)",
            Status = "Approved"
        };
        db.DoctorLeaves.Add(clinicClosure);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        result.IsOnDuty.Should().BeFalse();
        result.NonAvailabilityReason.Should().Be("National Heroes Day (Clinic Closed)");
        result.Slots.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_DoctorFullDayLeave_ReturnsNoSlots()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(17, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);

        var fullDayLeave = new DoctorLeave
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            StartDate = date,
            EndDate = date,
            PartialDayStartTime = null,
            PartialDayEndTime = null,
            Reason = "PMA Annual Convention",
            Status = "Approved"
        };
        db.DoctorLeaves.Add(fullDayLeave);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        result.IsOnDuty.Should().BeFalse();
        result.NonAvailabilityReason.Should().Be("PMA Annual Convention");
        result.Slots.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_MultiDayLeave_MiddleDay_ReturnsNoSlots()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var mondayDate = GetFutureMonday();

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(17, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(template);

        // Leave from Saturday to Wednesday surrounding Monday
        var multiDayLeave = new DoctorLeave
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            StartDate = mondayDate.AddDays(-2),
            EndDate = mondayDate.AddDays(2),
            Reason = "Official Foreign Mission",
            Status = "Approved"
        };
        db.DoctorLeaves.Add(multiDayLeave);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, mondayDate, null, CancellationToken.None);

        result.IsOnDuty.Should().BeFalse();
        result.NonAvailabilityReason.Should().Be("Official Foreign Mission");
        result.Slots.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_BreakCollisions_BoundaryContiguity()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var date = GetFutureMonday(); // Monday

        var template = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(11, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        };
        // Break exactly 09:30 to 10:00
        var breakTime = new DoctorBreakTime
        {
            Id = Guid.NewGuid(),
            TemplateId = template.Id,
            Description = "Mid-Morning Coffee Break",
            StartTime = new TimeOnly(9, 30),
            EndTime = new TimeOnly(10, 0)
        };
        template.BreakTimes.Add(breakTime);
        db.DoctorScheduleTemplates.Add(template);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, date, null, CancellationToken.None);

        result.Slots.Should().HaveCount(4);
        // 09:00 - 09:30: Available
        result.Slots[0].StartTime.Should().Be(new TimeOnly(9, 0));
        result.Slots[0].IsAvailable.Should().BeTrue();
        result.Slots[0].Status.Should().Be("Available");

        // 09:30 - 10:00: Break
        result.Slots[1].StartTime.Should().Be(new TimeOnly(9, 30));
        result.Slots[1].IsAvailable.Should().BeFalse();
        result.Slots[1].Status.Should().Be("Break");

        // 10:00 - 10:30: Available (boundary check: break ends at 10:00, slot starts at 10:00)
        result.Slots[2].StartTime.Should().Be(new TimeOnly(10, 0));
        result.Slots[2].IsAvailable.Should().BeTrue();
        result.Slots[2].Status.Should().Be("Available");

        // 10:30 - 11:00: Available
        result.Slots[3].StartTime.Should().Be(new TimeOnly(10, 30));
        result.Slots[3].IsAvailable.Should().BeTrue();
        result.Slots[3].Status.Should().Be("Available");
    }

    [Fact]
    public async Task GetDoctorAvailabilityAsync_OvernightShift_BookedSlotDuringRollover_MarksBooked()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var mondayDate = GetFutureMonday();

        // Sunday night shift: 22:00 to 02:00 (spills into Monday 00:00 to 02:00)
        var sundayTemplate = new DoctorScheduleTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Sunday,
            StartTime = new TimeOnly(22, 0),
            EndTime = new TimeOnly(2, 0),
            SlotDurationMinutes = 60,
            IsOvernightShift = true,
            IsActive = true
        };
        db.DoctorScheduleTemplates.Add(sundayTemplate);

        // Booked appointment on Monday at 00:00 Manila (UTC+8 -> 16:00 Sunday UTC)
        var mondayMidnightUtc = mondayDate.ToDateTime(new TimeOnly(0, 0), DateTimeKind.Unspecified).AddHours(-8);
        var appt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            PatientId = Guid.NewGuid(),
            PatientName = "Overnight Patient",
            ScheduledAt = DateTime.SpecifyKind(mondayMidnightUtc, DateTimeKind.Utc),
            EndTimeUtc = DateTime.SpecifyKind(mondayMidnightUtc.AddHours(1), DateTimeKind.Utc),
            Status = AppointmentStatus.Confirmed
        };
        db.Appointments.Add(appt);
        await db.SaveChangesAsync();

        var service = CreateService(db);

        // Query on Monday
        var result = await service.GetDoctorAvailabilityAsync(_clinicId, _doctorId, mondayDate, null, CancellationToken.None);

        result.Slots.Should().HaveCount(2); // 00:00 and 01:00
        var slot0 = result.Slots[0];
        slot0.StartTime.Should().Be(new TimeOnly(0, 0));
        slot0.Status.Should().Be("Booked");
        slot0.IsAvailable.Should().BeFalse();
        slot0.PatientName.Should().Be("Overnight Patient");

        var slot1 = result.Slots[1];
        slot1.StartTime.Should().Be(new TimeOnly(1, 0));
        slot1.Status.Should().Be("Available");
        slot1.IsAvailable.Should().BeTrue();
    }
}

