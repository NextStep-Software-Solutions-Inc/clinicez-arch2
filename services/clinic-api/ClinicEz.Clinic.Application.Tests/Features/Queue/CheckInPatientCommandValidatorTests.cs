using System;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class CheckInPatientCommandValidatorTests
{
    private readonly CheckInPatientCommandValidator _validator = new();

    private static CheckInPatientCommand CreateCommand(
        string? chiefComplaint = null,
        Guid? patientId = null,
        string? patientName = null,
        QueuePriority priority = QueuePriority.Routine) =>
        new(
            PatientId: patientId ?? Guid.NewGuid(),
            PatientName: patientName ?? "Jane Doe",
            AppointmentId: null,
            DoctorId: null,
            DoctorName: null,
            Priority: priority,
            ChiefComplaint: chiefComplaint,
            RoomOrStation: "Room 1"
        );

    [Fact]
    public void Validate_NullChiefComplaint_PassesValidation()
    {
        var command = CreateCommand(chiefComplaint: null);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_EmptyChiefComplaint_PassesValidation()
    {
        var command = CreateCommand(chiefComplaint: string.Empty);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_ChiefComplaintUnder255Chars_PassesValidation()
    {
        var command = CreateCommand(chiefComplaint: "Acute dry cough and mild fever for 2 days");
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_ChiefComplaintExactly255Chars_PassesValidation()
    {
        var exact255 = new string('A', 255);
        var command = CreateCommand(chiefComplaint: exact255);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_ChiefComplaintExceeding255Chars_FailsValidationWithSpecificErrorMessage()
    {
        var tooLong = new string('A', 256);
        var command = CreateCommand(chiefComplaint: tooLong);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => 
            e.PropertyName == nameof(CheckInPatientCommand.ChiefComplaint) &&
            e.ErrorMessage == "Chief complaint must not exceed 255 characters.");
    }

    [Fact]
    public void Validate_ChiefComplaint500Chars_FailsValidationWithSpecificErrorMessage()
    {
        var tooLong = new string('B', 500);
        var command = CreateCommand(chiefComplaint: tooLong);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => 
            e.PropertyName == nameof(CheckInPatientCommand.ChiefComplaint) &&
            e.ErrorMessage == "Chief complaint must not exceed 255 characters.");
    }

    [Fact]
    public void Validate_EmptyPatientId_FailsValidation()
    {
        var command = CreateCommand(patientId: Guid.Empty);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CheckInPatientCommand.PatientId));
    }

    [Fact]
    public void Validate_EmptyPatientName_FailsValidation()
    {
        var command = CreateCommand(patientName: "");
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CheckInPatientCommand.PatientName));
    }

    [Fact]
    public void Validate_PatientNameExceeding150Chars_FailsValidation()
    {
        var longName = new string('X', 151);
        var command = CreateCommand(patientName: longName);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CheckInPatientCommand.PatientName));
    }

    [Fact]
    public void Validate_InvalidPriorityEnum_FailsValidation()
    {
        var command = CreateCommand(priority: (QueuePriority)999);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CheckInPatientCommand.Priority));
    }
}
