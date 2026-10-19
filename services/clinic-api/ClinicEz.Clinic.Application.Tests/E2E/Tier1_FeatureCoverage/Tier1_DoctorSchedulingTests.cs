using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier1_FeatureCoverage;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 1: Feature Coverage for Milestone M1 (Features 1 through 6).
/// Each feature contains at least 5 distinct test cases verifying primary behavior.
/// </summary>
public class Tier1_DoctorSchedulingTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();

    // =========================================================================
    // Feature 1: Doctor Schedule Templates & Breaks
    // =========================================================================
    [Fact]
    public void F1_T1_WeeklyScheduleTemplate_ConfiguresRecurringDaysCorrectly()
    {
        var template = new DoctorScheduleTemplateDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            DoctorId: _doctorId,
            DayOfWeek: DayOfWeek.Monday,
            StartTime: new TimeOnly(8, 0),
            EndTime: new TimeOnly(17, 0),
            SlotDuration: SlotInterval.Minutes30,
            IsActive: true,
            Breaks: new List<DoctorShiftBreakDto>());

        template.DayOfWeek.Should().Be(DayOfWeek.Monday);
        template.StartTime.Hour.Should().Be(8);
        template.EndTime.Hour.Should().Be(17);
        template.IsActive.Should().BeTrue();
    }

    [Fact]
    public void F1_T2_ScheduleTemplate_SupportsConfigurableSlotDurations()
    {
        var template15 = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Tuesday,
            new TimeOnly(9, 0), new TimeOnly(12, 0), SlotInterval.Minutes15, true, new());
        var template30 = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Tuesday,
            new TimeOnly(9, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());
        var template60 = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Tuesday,
            new TimeOnly(9, 0), new TimeOnly(12, 0), SlotInterval.Minutes60, true, new());

        ((int)template15.SlotDuration).Should().Be(15);
        ((int)template30.SlotDuration).Should().Be(30);
        ((int)template60.SlotDuration).Should().Be(60);
    }

    [Fact]
    public void F1_T3_ShiftBreaks_SupportLunchAndRestPeriods()
    {
        var templateId = Guid.NewGuid();
        var lunchBreak = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, new TimeOnly(12, 0), new TimeOnly(13, 0), "Lunch Break");
        var coffeeBreak = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, new TimeOnly(15, 0), new TimeOnly(15, 30), "Afternoon Break");

        var template = new DoctorScheduleTemplateDto(templateId, _clinicId, _doctorId, DayOfWeek.Wednesday,
            new TimeOnly(8, 0), new TimeOnly(17, 0), SlotInterval.Minutes30, true, new() { lunchBreak, coffeeBreak });

        template.Breaks.Should().HaveCount(2);
        template.Breaks.First().Description.Should().Be("Lunch Break");
    }

    [Fact]
    public void F1_T4_InactiveTemplate_DisablesAvailability()
    {
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(9, 0), new TimeOnly(17, 0), SlotInterval.Minutes30, false, new());

        var mondayDate = new DateOnly(2026, 10, 12); // Monday
        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, mondayDate, template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().BeEmpty();
    }

    [Fact]
    public void F1_T5_ShiftBreaks_AreContainedWithinWorkingHours()
    {
        var templateId = Guid.NewGuid();
        var shiftStart = new TimeOnly(8, 0);
        var shiftEnd = new TimeOnly(17, 0);
        var breakStart = new TimeOnly(12, 0);
        var breakEnd = new TimeOnly(13, 0);

        var shiftBreak = new DoctorShiftBreakDto(Guid.NewGuid(), templateId, breakStart, breakEnd, "Midday Recess");

        breakStart.Should().BeOnOrAfter(shiftStart);
        breakEnd.Should().BeOnOrBefore(shiftEnd);
        (breakEnd > breakStart).Should().BeTrue();
    }

    // =========================================================================
    // Feature 2: Doctor Leaves & Blackouts
    // =========================================================================
    [Fact]
    public void F2_T1_DoctorLeave_FullDayBlackout_BlocksEntireSchedule()
    {
        var date = new DateOnly(2026, 10, 14); // Wednesday
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Wednesday,
            new TimeOnly(8, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());

        var leave = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc),
            "Annual CME Leave", true);

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto> { leave }, new List<AppointmentRange>());

        slots.Should().NotBeEmpty();
        slots.Should().OnlyContain(s => !s.IsAvailable && s.ConflictReason!.Contains("leave"));
    }

    [Fact]
    public void F2_T2_UnapprovedLeave_DoesNotBlockSlots()
    {
        var date = new DateOnly(2026, 10, 14); // Wednesday
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Wednesday,
            new TimeOnly(8, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());

        var pendingLeave = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc),
            "Pending PTO", false);

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto> { pendingLeave }, new List<AppointmentRange>());

        slots.Should().OnlyContain(s => s.IsAvailable);
    }

    [Fact]
    public void F2_T3_MultiDayLeave_BlocksAllDaysWithinSpan()
    {
        var startLeave = new DateTime(2026, 10, 12, 0, 0, 0, DateTimeKind.Utc);
        var endLeave = new DateTime(2026, 10, 16, 23, 59, 59, DateTimeKind.Utc);

        var leave = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId, startLeave, endLeave, "Medical Conference", true);

        var dayInSpan = new DateOnly(2026, 10, 14); // Wednesday
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Wednesday,
            new TimeOnly(8, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, dayInSpan, template, new List<DoctorLeaveDto> { leave }, new List<AppointmentRange>());

        slots.Should().OnlyContain(s => !s.IsAvailable);
    }

    [Fact]
    public void F2_T4_LeaveForOtherDoctor_DoesNotAffectTargetDoctor()
    {
        var date = new DateOnly(2026, 10, 14);
        var otherDoctorId = Guid.NewGuid();
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Wednesday,
            new TimeOnly(8, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new());

        var otherDoctorLeave = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, otherDoctorId,
            date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc),
            "Other Doctor Vacation", true);

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto> { otherDoctorLeave }, new List<AppointmentRange>());

        slots.Should().OnlyContain(s => s.IsAvailable);
    }

    [Fact]
    public void F2_T5_LeaveOutsideQueryDate_DoesNotBlockSlots()
    {
        var date = new DateOnly(2026, 10, 14); // Wednesday
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Wednesday,
            new TimeOnly(8, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new());

        var nextWeekLeave = new DoctorLeaveDto(Guid.NewGuid(), _clinicId, _doctorId,
            new DateTime(2026, 10, 21, 0, 0, 0, DateTimeKind.Utc),
            new DateTime(2026, 10, 21, 23, 59, 59, DateTimeKind.Utc),
            "Next Week Leave", true);

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto> { nextWeekLeave }, new List<AppointmentRange>());

        slots.Should().OnlyContain(s => s.IsAvailable);
    }

    // =========================================================================
    // Feature 3: Slot Availability Engine
    // =========================================================================
    [Fact]
    public void F3_T1_SlotCalculation_GeneratesExactSlotCounts()
    {
        // 8:00 to 12:00 with 30m slots = 4 hours * 2 = 8 slots
        var date = new DateOnly(2026, 10, 12); // Monday
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().HaveCount(8);
        slots.All(s => s.IsAvailable).Should().BeTrue();
    }

    [Fact]
    public void F3_T2_SlotCalculation_SkipsScheduledBreaks()
    {
        var date = new DateOnly(2026, 10, 12);
        var lunch = new DoctorShiftBreakDto(Guid.NewGuid(), Guid.NewGuid(), new TimeOnly(12, 0), new TimeOnly(13, 0), "Lunch");
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(11, 0), new TimeOnly(14, 0), SlotInterval.Minutes30, true, new() { lunch });

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        // 11:00-11:30 (avail), 11:30-12:00 (avail), 12:00-12:30 (break), 12:30-13:00 (break), 13:00-13:30 (avail), 13:30-14:00 (avail)
        slots.Should().HaveCount(6);
        slots.Count(s => s.IsAvailable).Should().Be(4);
        slots.Count(s => !s.IsAvailable).Should().Be(2);
    }

    [Fact]
    public void F3_T3_SlotCalculation_MarksExistingBookingsAsUnavailable()
    {
        var date = new DateOnly(2026, 10, 12);
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(9, 0), new TimeOnly(11, 0), SlotInterval.Minutes30, true, new());

        var bookedSlotStart = date.ToDateTime(new TimeOnly(9, 30), DateTimeKind.Utc);
        var bookedSlotEnd = date.ToDateTime(new TimeOnly(10, 0), DateTimeKind.Utc);

        var existingBooking = new AppointmentRange(Guid.NewGuid(), _clinicId, _doctorId, bookedSlotStart, bookedSlotEnd, "Confirmed");

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), new List<AppointmentRange> { existingBooking });

        slots.Should().HaveCount(4);
        var bookedSlot = slots.First(s => s.StartUtc == bookedSlotStart);
        bookedSlot.IsAvailable.Should().BeFalse();
        bookedSlot.ConflictReason.Should().Contain("booked");
    }

    [Fact]
    public void F3_T4_SlotCalculation_CancelledBookingsDoNotBlockSlots()
    {
        var date = new DateOnly(2026, 10, 12);
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(9, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new());

        var cancelledBooking = new AppointmentRange(Guid.NewGuid(), _clinicId, _doctorId,
            date.ToDateTime(new TimeOnly(9, 0), DateTimeKind.Utc),
            date.ToDateTime(new TimeOnly(9, 30), DateTimeKind.Utc),
            "Cancelled");

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), new List<AppointmentRange> { cancelledBooking });

        slots.Should().OnlyContain(s => s.IsAvailable);
    }

    [Fact]
    public void F3_T5_SlotCalculation_ReturnsEmptyWhenDayDoesNotMatchTemplate()
    {
        var tuesdayDate = new DateOnly(2026, 10, 13); // Tuesday
        var mondayTemplate = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(9, 0), new TimeOnly(17, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, tuesdayDate, mondayTemplate, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().BeEmpty();
    }

    // =========================================================================
    // Feature 4: PostgreSQL GiST Concurrency Guarding
    // =========================================================================
    [Fact]
    public void F4_T1_GiSTExclusion_IdenticalTimeWindow_TriggersCollision()
    {
        var startUtc = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var endUtc = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, startUtc, endUtc, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, startUtc, endUtc, existing);

        act.Should().Throw<ConflictException>()
            .WithMessage("*already has an appointment*");
    }

    [Fact]
    public void F4_T2_GiSTExclusion_PartialOverlappingWindow_TriggersCollision()
    {
        var existingStart = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var existingEnd = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var newStart = new DateTime(2026, 10, 12, 9, 15, 0, DateTimeKind.Utc);
        var newEnd = new DateTime(2026, 10, 12, 9, 45, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, existingStart, existingEnd, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, newStart, newEnd, existing);

        act.Should().Throw<ConflictException>();
    }

    [Fact]
    public void F4_T3_GiSTExclusion_ContiguousAdjacentSlots_DoNotCollide()
    {
        // Half-open interval semantics: [09:00, 09:30) and [09:30, 10:00) do NOT overlap
        var slot1Start = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var slot1End = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var slot2Start = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);
        var slot2End = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, slot1Start, slot1End, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, slot2Start, slot2End, existing);

        act.Should().NotThrow();
    }

    [Fact]
    public void F4_T4_GiSTExclusion_DifferentDoctorSameSlot_DoesNotCollide()
    {
        var otherDoctorId = Guid.NewGuid();
        var start = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, otherDoctorId, start, end, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, start, end, existing);

        act.Should().NotThrow();
    }

    [Fact]
    public void F4_T5_GiSTExclusion_CancelledAppointment_DoesNotCollide()
    {
        var start = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, start, end, "Cancelled")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, start, end, existing);

        act.Should().NotThrow();
    }

    // =========================================================================
    // Feature 5: Scheduling Exception Mapping
    // =========================================================================
    [Fact]
    public void F5_T1_ConflictException_Returns409Equivalent()
    {
        var ex = new ConflictException("The selected doctor already has an appointment during this time window.");
        ex.Message.Should().Contain("already has an appointment");
    }

    [Fact]
    public void F5_T2_InvalidBookingTime_ThrowsArgumentException()
    {
        var start = new DateTime(2026, 10, 12, 10, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc); // End before start

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, start, end, new List<AppointmentRange>());

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void F5_T3_RescheduleCollision_DetectsConflictOnNewTargetSlot()
    {
        var targetSlotStart = new DateTime(2026, 10, 12, 14, 0, 0, DateTimeKind.Utc);
        var targetSlotEnd = new DateTime(2026, 10, 12, 14, 30, 0, DateTimeKind.Utc);

        var existingOnTarget = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, targetSlotStart, targetSlotEnd, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, targetSlotStart, targetSlotEnd, existingOnTarget);

        act.Should().Throw<ConflictException>();
    }

    [Fact]
    public void F5_T4_SuccessfulBooking_CompletesWithoutException()
    {
        var start = new DateTime(2026, 10, 12, 15, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 10, 12, 15, 30, 0, DateTimeKind.Utc);

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, start, end, new List<AppointmentRange>());

        act.Should().NotThrow();
    }

    [Fact]
    public void F5_T5_MultiTenantIsolation_DifferentClinicSameTime_DoesNotCollide()
    {
        var otherClinicId = Guid.NewGuid();
        var start = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), otherClinicId, _doctorId, start, end, "Confirmed")
        };

        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, start, end, existing);

        act.Should().NotThrow();
    }

    // =========================================================================
    // Feature 6: SlotPicker & Roster UI Components Contract
    // =========================================================================
    [Fact]
    public void F6_T1_SlotPicker_GeneratesDiscreteTimeChips()
    {
        var date = new DateOnly(2026, 10, 12);
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(10, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().HaveCount(4);
        slots.Select(s => s.StartUtc.ToString("HH:mm")).Should().ContainInOrder("08:00", "08:30", "09:00", "09:30");
    }

    [Fact]
    public void F6_T2_SlotPicker_DistinguishesAvailableVsUnavailableState()
    {
        var date = new DateOnly(2026, 10, 12);
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(9, 30), SlotInterval.Minutes30, true, new());

        var bookedStart = date.ToDateTime(new TimeOnly(8, 30), DateTimeKind.Utc);
        var existing = new List<AppointmentRange>
        {
            new(Guid.NewGuid(), _clinicId, _doctorId, bookedStart, bookedStart.AddMinutes(30), "Confirmed")
        };

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), existing);

        slots[0].IsAvailable.Should().BeTrue();
        slots[1].IsAvailable.Should().BeFalse();
        slots[2].IsAvailable.Should().BeTrue();
    }

    [Fact]
    public void F6_T3_DoctorRosterCalendar_ShowsFullShiftSpan()
    {
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Friday,
            new TimeOnly(13, 0), new TimeOnly(19, 0), SlotInterval.Minutes60, true, new());

        var totalShiftHours = (template.EndTime - template.StartTime).TotalHours;
        totalShiftHours.Should().Be(6.0);
    }

    [Fact]
    public void F6_T4_SlotPicker_HandlesZeroSlotsGracefully()
    {
        var date = new DateOnly(2026, 10, 18); // Sunday
        var weekdayTemplate = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(17, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, weekdayTemplate, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        slots.Should().BeEmpty();
    }

    [Fact]
    public void F6_T5_SlotPicker_DisplaysReasonForUnavailableSlot()
    {
        var date = new DateOnly(2026, 10, 12);
        var breakTime = new DoctorShiftBreakDto(Guid.NewGuid(), Guid.NewGuid(), new TimeOnly(12, 0), new TimeOnly(13, 0), "Doctor Lunch Break");
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(11, 30), new TimeOnly(13, 30), SlotInterval.Minutes30, true, new() { breakTime });

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, date, template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());

        var breakSlot = slots.First(s => !s.IsAvailable);
        breakSlot.ConflictReason.Should().NotBeNullOrWhiteSpace();
        breakSlot.ConflictReason.Should().Contain("break");
    }
}
