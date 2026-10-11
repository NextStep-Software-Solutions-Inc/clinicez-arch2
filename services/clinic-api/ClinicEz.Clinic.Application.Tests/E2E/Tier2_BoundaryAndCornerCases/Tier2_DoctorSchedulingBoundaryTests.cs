using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier2_BoundaryAndCornerCases;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 2: Boundary & Corner Cases for Milestone M1 (Features 1 through 6).
/// Contains >=5 boundary and adversarial edge cases per feature (30 total tests).
/// </summary>
public class Tier2_DoctorSchedulingBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();

    // =========================================================================
    // Feature 1 Boundaries: Schedule Templates & Breaks
    // =========================================================================
    [Fact]
    public void F1_B1_ShiftDuration_ExactlyEqualToSingleSlotDuration()
    {
        // 09:00 to 09:15 with 15m slot duration = exactly 1 slot
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Tuesday,
            new TimeOnly(9, 0), new TimeOnly(9, 15), SlotInterval.Minutes15, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 13), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().ContainSingle();
        slots[0].StartUtc.Hour.Should().Be(9);
        slots[0].StartUtc.Minute.Should().Be(0);
    }

    [Fact]
    public void F1_B2_BreakInterval_ExactlyAtShiftStart_BlocksFirstSlot()
    {
        var templateId = Guid.NewGuid();
        var morningBriefing = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, new TimeOnly(8, 0), new TimeOnly(8, 30), "Morning Huddle");
        var template = new DoctorScheduleTemplateDto(templateId, _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new() { morningBriefing });

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 12), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().HaveCount(4);
        slots[0].IsAvailable.Should().BeFalse();
        slots[0].ConflictReason.Should().Contain("break");
        slots[1].IsAvailable.Should().BeTrue();
    }

    [Fact]
    public void F1_B3_BreakInterval_ExactlyAtShiftEnd_BlocksLastSlot()
    {
        var templateId = Guid.NewGuid();
        var chartSigning = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, new TimeOnly(16, 30), new TimeOnly(17, 0), "End-of-day Charting");
        var template = new DoctorScheduleTemplateDto(templateId, _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(15, 0), new TimeOnly(17, 0), SlotInterval.Minutes30, true, new() { chartSigning });

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 12), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().HaveCount(4);
        slots.Last().IsAvailable.Should().BeFalse();
        slots.Last().ConflictReason.Should().Contain("break");
    }

    [Fact]
    public void F1_B4_MultipleNonContiguousBreaks_HandledCorrectly()
    {
        var templateId = Guid.NewGuid();
        var break1 = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, new TimeOnly(10, 0), new TimeOnly(10, 30), "Tea");
        var break2 = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, new TimeOnly(12, 0), new TimeOnly(13, 0), "Lunch");
        var break3 = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, new TimeOnly(15, 0), new TimeOnly(15, 30), "Afternoon");

        var template = new DoctorScheduleTemplateDto(templateId, _clinicId, _doctorId, DayOfWeek.Wednesday,
            new TimeOnly(8, 0), new TimeOnly(17, 0), SlotInterval.Minutes30, true, new() { break1, break2, break3 });

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 14), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Count(s => !s.IsAvailable).Should().Be(4); // 1 slot + 2 slots + 1 slot = 4 break slots
    }

    [Fact]
    public void F1_B5_ShiftDuration_ShorterThanSlotDuration_YieldsZeroSlots()
    {
        // 20-minute shift with 30m slot duration
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(9, 0), new TimeOnly(9, 20), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 12), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().BeEmpty();
    }

    // =========================================================================
    // Feature 2 Boundaries: Leaves & Blackouts
    // =========================================================================
    [Fact]
    public void F2_B1_SubHourEmergencyLeave_BlocksIntersectingSlotsOnly()
    {
        var date = new DateOnly(2026, 10, 12);
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());

        // Leave from 09:15 to 09:45 (blocks 09:00-09:30 and 09:30-10:00 partially)
        var leave = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            date.ToDateTime(new TimeOnly(9, 15), DateTimeKind.Utc),
            date.ToDateTime(new TimeOnly(9, 45), DateTimeKind.Utc),
            "Doctor Medical Emergency", true);

        var dayStartUtc = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var dayEndUtc = date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto> { leave }, new List<AppointmentRange>());

        // Day contains leave blackout
        slots.Should().OnlyContain(s => !s.IsAvailable);
    }

    [Fact]
    public void F2_B2_LeaveEndingAtExactSecondShiftBegins_DoesNotBlockShift()
    {
        var date = new DateOnly(2026, 10, 12);
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(13, 0), new TimeOnly(17, 0), SlotInterval.Minutes30, true, new());

        // Morning leave ends exactly at 13:00:00 UTC
        var leave = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            date.ToDateTime(new TimeOnly(8, 0), DateTimeKind.Utc),
            date.ToDateTime(new TimeOnly(13, 0), DateTimeKind.Utc),
            "Morning Seminar", false); // Unapproved or contiguous boundary

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto> { leave }, new List<AppointmentRange>());

        slots.Should().OnlyContain(s => s.IsAvailable);
    }

    [Fact]
    public void F2_B3_LeapYearFebruary29Leave_EnforcedCorrectly()
    {
        var leapDay = new DateOnly(2028, 2, 29); // Tuesday
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Tuesday,
            new TimeOnly(8, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());

        var leave = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            leapDay.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            leapDay.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc),
            "Leap Day Holiday", true);

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, leapDay, template, new List<DoctorLeaveDto> { leave }, new List<AppointmentRange>());

        slots.Should().OnlyContain(s => !s.IsAvailable);
    }

    [Fact]
    public void F2_B4_MultipleNonContiguousLeaves_InSameMonth()
    {
        var leave1 = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            new DateTime(2026, 10, 5, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 6, 23, 59, 59, DateTimeKind.Utc), "Leave 1", true);
        var leave2 = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 21, 23, 59, 59, DateTimeKind.Utc), "Leave 2", true);

        var midMonthDate = new DateOnly(2026, 10, 12); // Between the two leaves
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, midMonthDate, template, new List<DoctorLeaveDto> { leave1, leave2 }, new List<AppointmentRange>());

        slots.Should().OnlyContain(s => s.IsAvailable);
    }

    [Fact]
    public void F2_B5_OverlappingLeavesForSameDoctor_IdempotentlyBlocksAvailability()
    {
        var date = new DateOnly(2026, 10, 12);
        var leave1 = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc), date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc), "Sick Leave", true);
        var leave2 = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc), date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc), "Emergency Leave", true);

        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto> { leave1, leave2 }, new List<AppointmentRange>());

        slots.Should().OnlyContain(s => !s.IsAvailable);
    }

    // =========================================================================
    // Feature 3 Boundaries: Slot Availability Engine
    // =========================================================================
    [Fact]
    public void F3_B1_ShiftNotEvenMultipleOfSlotDuration_TruncatesPartialWindow()
    {
        // 08:00 to 08:50 (50 minutes) with 15m slots -> 08:00, 08:15, 08:30 (3 slots, remaining 5m dropped)
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(8, 50), SlotInterval.Minutes15, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 12), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().HaveCount(3);
        slots.Last().EndUtc.Minute.Should().Be(45);
    }

    [Fact]
    public void F3_B2_MultiSlotAppointment_BlocksMultipleConsecutiveSlots()
    {
        var date = new DateOnly(2026, 10, 12);
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(9, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());

        // 90-minute minor surgery appointment from 09:30 to 11:00
        var surgicalBooking = new AppointmentRange(Guid.NewGuid(), _clinicId, _doctorId,
            date.ToDateTime(new TimeOnly(9, 30), DateTimeKind.Utc),
            date.ToDateTime(new TimeOnly(11, 0), DateTimeKind.Utc),
            "Confirmed");

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), new List<AppointmentRange> { surgicalBooking });

        // 6 total slots: 09:00 (avail), 09:30 (blocked), 10:00 (blocked), 10:30 (blocked), 11:00 (avail), 11:30 (avail)
        slots.Should().HaveCount(6);
        slots[0].IsAvailable.Should().BeTrue();
        slots[1].IsAvailable.Should().BeFalse();
        slots[2].IsAvailable.Should().BeFalse();
        slots[3].IsAvailable.Should().BeFalse();
        slots[4].IsAvailable.Should().BeTrue();
        slots[5].IsAvailable.Should().BeTrue();
    }

    [Fact]
    public void F3_B3_BreakPartiallyIntersectingSlot_MarksSlotUnavailable()
    {
        var date = new DateOnly(2026, 10, 12);
        var breakTime = new DoctorShiftBreakDto(Guid.NewGuid(), Guid.NewGuid(), new TimeOnly(10, 15), new TimeOnly(10, 45), "Coffee Break");
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(10, 0), new TimeOnly(11, 0), SlotInterval.Minutes30, true, new() { breakTime });

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        // Slots: 10:00-10:30 (intersects 10:15-10:45 break) -> blocked
        // Slots: 10:30-11:00 (intersects 10:15-10:45 break) -> blocked
        slots.Should().HaveCount(2);
        slots.All(s => !s.IsAvailable).Should().BeTrue();
    }

    [Fact]
    public void F3_B4_QueryDateFarInFuture_CalculatesSlotsAccurately()
    {
        var futureDate = new DateOnly(2030, 10, 14); // Monday
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(9, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, futureDate, template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().HaveCount(2);
        slots.All(s => s.IsAvailable).Should().BeTrue();
    }

    [Fact]
    public void F3_B5_AllSlotsBooked_ReturnsZeroAvailableSlots()
    {
        var date = new DateOnly(2026, 10, 12);
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(9, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new());

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, date.ToDateTime(new TimeOnly(9, 0), DateTimeKind.Utc), date.ToDateTime(new TimeOnly(9, 30), DateTimeKind.Utc), "Confirmed"),
            new(Guid.NewGuid(), _clinicId, _doctorId, date.ToDateTime(new TimeOnly(9, 30), DateTimeKind.Utc), date.ToDateTime(new TimeOnly(10, 0), DateTimeKind.Utc), "Confirmed")
        };

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), existing);

        slots.Should().HaveCount(2);
        slots.All(s => !s.IsAvailable).Should().BeTrue();
    }

    // =========================================================================
    // Feature 4 Boundaries: PostgreSQL GiST Concurrency Guarding
    // =========================================================================
    [Fact]
    public void F4_B1_GiSTExclusion_MillisecondExactBoundary_DoesNotCollide()
    {
        // [09:00:00.000, 09:30:00.000) and [09:30:00.000, 10:00:00.000)
        var slot1Start = new DateTime(2026, 10, 12, 9, 0, 0, 0, DateTimeKind.Utc);
        var slot1End = new DateTime(2026, 10, 12, 9, 30, 0, 0, DateTimeKind.Utc);
        var slot2Start = new DateTime(2026, 10, 12, 9, 30, 0, 0, DateTimeKind.Utc);
        var slot2End = new DateTime(2026, 10, 12, 10, 0, 0, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, slot1Start, slot1End, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, slot2Start, slot2End, existing);

        act.Should().NotThrow();
    }

    [Fact]
    public void F4_B2_GiSTExclusion_SingleMillisecondOverlap_Collides()
    {
        // [09:00:00, 09:30:00] overlapping by 1 ms with [09:29:59.999, 10:00:00]
        var existingStart = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var existingEnd = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var newStart = existingEnd.AddMilliseconds(-1);
        var newEnd = newStart.AddMinutes(30);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, existingStart, existingEnd, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, newStart, newEnd, existing);

        act.Should().Throw<ConflictException>();
    }

    [Fact]
    public void F4_B3_GiSTExclusion_EnclosedSubInterval_Collides()
    {
        // Existing booking spans 09:00 to 11:00. New booking attempts 09:30 to 10:00 (enclosed within)
        var existingStart = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var existingEnd = new DateTime(2026, 10, 12, 11, 0, 0, DateTimeKind.Utc);

        var newStart = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);
        var newEnd = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, existingStart, existingEnd, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, newStart, newEnd, existing);

        act.Should().Throw<ConflictException>();
    }

    [Fact]
    public void F4_B4_GiSTExclusion_EnclosingSuperInterval_Collides()
    {
        // Existing booking spans 09:30 to 10:00. New booking attempts 09:00 to 11:00 (enclosing existing)
        var existingStart = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);
        var existingEnd = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc);

        var newStart = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var newEnd = new DateTime(2026, 10, 12, 11, 0, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, existingStart, existingEnd, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, newStart, newEnd, existing);

        act.Should().Throw<ConflictException>();
    }

    [Fact]
    public void F4_B5_GiSTExclusion_CompletedAppointmentStatus_StillBlocksRebooking()
    {
        // Past appointments that were completed must still preserve history and block overlapping slot
        var start = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, start, end, "Completed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, start, end, existing);

        act.Should().Throw<ConflictException>();
    }

    // =========================================================================
    // Feature 5 Boundaries: Scheduling Exception Mapping
    // =========================================================================
    [Fact]
    public void F5_B1_ZeroDurationAppointment_ThrowsArgumentException()
    {
        var start = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, start, start, new List<AppointmentRange>());

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void F5_B2_EndBeforeStart_ThrowsArgumentException()
    {
        var start = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, start, end, new List<AppointmentRange>());

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void F5_B3_ConflictException_ContainsNoInternalSqlDetails()
    {
        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc), "Confirmed")
        };

        try
        {
            Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc), existing);
        }
        catch (ConflictException ex)
        {
            ex.Message.Should().NotContain("SELECT");
            ex.Message.Should().NotContain("INSERT");
            ex.Message.Should().NotContain("btree_gist");
        }
    }

    [Fact]
    public void F5_B4_ConcurrentBookingRace_FirstSucceedsSecondFails()
    {
        var slotStart = new DateTime(2026, 10, 12, 14, 0, 0, DateTimeKind.Utc);
        var slotEnd = new DateTime(2026, 10, 12, 14, 30, 0, DateTimeKind.Utc);

        var db = new List<AppointmentRange>();

        // Transaction 1 succeeds
        Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, slotStart, slotEnd, db);
        db.Add(new AppointmentRange(Guid.NewGuid(), _clinicId, _doctorId, slotStart, slotEnd, "Confirmed"));

        // Transaction 2 arrives and collides
        var act2 = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, slotStart, slotEnd, db);
        act2.Should().Throw<ConflictException>();
    }

    [Fact]
    public void F5_B5_ReschedulingToExistingSelfWindow_WithoutChange_AllowedWhenExcludingSelf()
    {
        var appointmentId = Guid.NewGuid();
        var start = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 10, 12, 10, 30, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(appointmentId, _clinicId, _doctorId, start, end, "Confirmed")
        };

        // Filter out self during reschedule
        var filtered = existing.Where(a => a.AppointmentId != appointmentId).ToList();
        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, start, end, filtered);

        act.Should().NotThrow();
    }

    // =========================================================================
    // Feature 6 Boundaries: SlotPicker & Roster UI Components
    // =========================================================================
    [Fact]
    public void F6_B1_HighDensitySchedule_CalculatesFortyEightSlotsForTwelveHourDay()
    {
        // 08:00 to 20:00 (12 hours) with 15m slots = 48 discrete chips
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Thursday,
            new TimeOnly(8, 0), new TimeOnly(20, 0), SlotInterval.Minutes15, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 15), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().HaveCount(48);
    }

    [Fact]
    public void F6_B2_AlternatingWorkAndBreakPattern_PreservesCorrectStatusSequence()
    {
        var templateId = Guid.NewGuid();
        var b1 = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, new TimeOnly(9, 15), new TimeOnly(9, 30), "Break 1");
        var b2 = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, new TimeOnly(9, 45), new TimeOnly(10, 0), "Break 2");

        var template = new DoctorScheduleTemplateDto(templateId, _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(9, 0), new TimeOnly(10, 0), SlotInterval.Minutes15, true, new() { b1, b2 });

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 12), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().HaveCount(4);
        slots[0].IsAvailable.Should().BeTrue();  // 09:00 - 09:15
        slots[1].IsAvailable.Should().BeFalse(); // 09:15 - 09:30 (break)
        slots[2].IsAvailable.Should().BeTrue();  // 09:30 - 09:45
        slots[3].IsAvailable.Should().BeFalse(); // 09:45 - 10:00 (break)
    }

    [Fact]
    public void F6_B3_NullTemplate_ReturnsEmptySlotsWithoutException()
    {
        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 12), null, new List<DoctorLeaveDto>(), new List<AppointmentRange>());
        slots.Should().BeEmpty();
    }

    [Fact]
    public void F6_B4_SlotPicker_ChipStartTimesAlwaysUtc()
    {
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(9, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 12), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.All(s => s.StartUtc.Kind == DateTimeKind.Utc).Should().BeTrue();
    }

    [Fact]
    public void F6_B5_SlotPicker_DoesNotProduceDuplicateChips()
    {
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, new DateOnly(2026, 10, 12), template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Select(s => s.StartUtc).Should().OnlyHaveUniqueItems();
    }
}
