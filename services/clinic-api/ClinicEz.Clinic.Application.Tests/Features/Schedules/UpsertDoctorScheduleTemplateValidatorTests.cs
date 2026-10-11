using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.Schedules.Commands;
using ClinicEz.Clinic.Application.Features.Schedules.DTOs;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Schedules;

public class UpsertDoctorScheduleTemplateValidatorTests
{
    private readonly UpsertDoctorScheduleTemplateValidator _validator = new();

    [Fact]
    public void ValidTemplate_PassesValidation()
    {
        var command = new UpsertDoctorScheduleTemplateCommand(
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Maria Santos",
            DayOfWeek: DayOfWeek.Monday,
            StartTime: new TimeOnly(9, 0),
            EndTime: new TimeOnly(17, 0),
            IsOvernightShift: false,
            SlotDurationMinutes: 30,
            Breaks: new List<DoctorBreakTimeDto>
            {
                new(null, "Lunch Break", new TimeOnly(12, 0), new TimeOnly(13, 0))
            });

        var result = _validator.Validate(command);

        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(5)]
    [InlineData(25)]
    [InlineData(75)]
    public void InvalidSlotInterval_FailsValidation(int invalidInterval)
    {
        var command = new UpsertDoctorScheduleTemplateCommand(
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Maria Santos",
            DayOfWeek: DayOfWeek.Monday,
            StartTime: new TimeOnly(9, 0),
            EndTime: new TimeOnly(17, 0),
            SlotDurationMinutes: invalidInterval);

        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "SlotDurationMinutes");
    }

    [Fact]
    public void StartTimeEqualsEndTime_FailsValidation()
    {
        var command = new UpsertDoctorScheduleTemplateCommand(
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Maria Santos",
            DayOfWeek: DayOfWeek.Monday,
            StartTime: new TimeOnly(9, 0),
            EndTime: new TimeOnly(9, 0));

        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void NonOvernight_EndTimeEarlierThanStartTime_FailsValidation()
    {
        var command = new UpsertDoctorScheduleTemplateCommand(
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Maria Santos",
            DayOfWeek: DayOfWeek.Monday,
            StartTime: new TimeOnly(17, 0),
            EndTime: new TimeOnly(9, 0),
            IsOvernightShift: false);

        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void OvernightShift_EndTimeEarlierThanStartTime_PassesValidation()
    {
        var command = new UpsertDoctorScheduleTemplateCommand(
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Maria Santos",
            DayOfWeek: DayOfWeek.Monday,
            StartTime: new TimeOnly(22, 0),
            EndTime: new TimeOnly(6, 0),
            IsOvernightShift: true,
            SlotDurationMinutes: 30);

        var result = _validator.Validate(command);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void BreakMisalignedWithSlotGrid_FailsValidation()
    {
        // 30 minute grid, break starts at 12:15 (minute 15 % 30 != 0)
        var command = new UpsertDoctorScheduleTemplateCommand(
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Maria Santos",
            DayOfWeek: DayOfWeek.Monday,
            StartTime: new TimeOnly(9, 0),
            EndTime: new TimeOnly(17, 0),
            SlotDurationMinutes: 30,
            Breaks: new List<DoctorBreakTimeDto>
            {
                new(null, "Coffee Break", new TimeOnly(12, 15), new TimeOnly(12, 45))
            });

        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("slot grid multiples"));
    }

    [Fact]
    public void BreakOutsideShiftHours_FailsValidation()
    {
        // Shift is 09:00 to 17:00, break is 18:00 to 19:00
        var command = new UpsertDoctorScheduleTemplateCommand(
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Maria Santos",
            DayOfWeek: DayOfWeek.Monday,
            StartTime: new TimeOnly(9, 0),
            EndTime: new TimeOnly(17, 0),
            SlotDurationMinutes: 30,
            Breaks: new List<DoctorBreakTimeDto>
            {
                new(null, "Dinner", new TimeOnly(18, 0), new TimeOnly(19, 0))
            });

        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("contained within shift hours"));
    }

    [Fact]
    public void OverlappingBreaks_FailsValidation()
    {
        var command = new UpsertDoctorScheduleTemplateCommand(
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Maria Santos",
            DayOfWeek: DayOfWeek.Monday,
            StartTime: new TimeOnly(9, 0),
            EndTime: new TimeOnly(17, 0),
            SlotDurationMinutes: 30,
            Breaks: new List<DoctorBreakTimeDto>
            {
                new(null, "Lunch 1", new TimeOnly(12, 0), new TimeOnly(13, 0)),
                new(null, "Lunch 2", new TimeOnly(12, 30), new TimeOnly(13, 30))
            });

        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("overlaps with break"));
    }
}
