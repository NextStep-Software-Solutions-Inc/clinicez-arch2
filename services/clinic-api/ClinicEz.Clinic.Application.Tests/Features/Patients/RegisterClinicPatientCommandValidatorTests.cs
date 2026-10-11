using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class RegisterClinicPatientCommandValidatorTests
{
    private readonly RegisterClinicPatientCommandValidator _validator = new();

    private static RegisterClinicPatientCommand CreateValidCommand(string? pin = null, List<CreateAllergyRequest>? allergies = null) =>
        new(
            FirstName: "Juan",
            LastName: "Dela Cruz",
            MiddleName: "Mendoza",
            Suffix: "Jr.",
            DateOfBirth: new DateOnly(1990, 1, 1),
            Gender: "Male",
            CivilStatus: "Single",
            ContactNumber: "09171234567",
            Email: "juan@example.com",
            AddressLine: "123 Mabini St",
            Barangay: "Barangay 1",
            City: "Manila",
            Province: "Metro Manila",
            EmergencyContactName: "Maria Dela Cruz",
            EmergencyContactPhone: "09181234567",
            EmergencyContactRelationship: "Mother",
            PhilHealthNumber: pin,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "O+",
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            StructuredAllergies: allergies
        );

    [Theory]
    [InlineData("12-345678901-8")] // Mod-11 valid
    [InlineData("01-025000001-0")] // Mod-11 valid with 0 check digit
    [InlineData("10-000000000-5")] // Mod-11 valid
    public void Validate_ValidMod11Pin_PassesValidation(string pin)
    {
        var command = CreateValidCommand(pin: pin);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_NullOrEmptyPin_PassesValidation()
    {
        var command = CreateValidCommand(pin: null);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();

        var commandEmpty = CreateValidCommand(pin: "   ");
        var resultEmpty = _validator.Validate(commandEmpty);
        resultEmpty.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("12-345678901-2")] // Invalid check digit (should be 8)
    [InlineData("01-025000001-9")] // Invalid check digit (should be 0)
    public void Validate_InvalidCheckDigit_FailsMod11Verification(string invalidPin)
    {
        var command = CreateValidCommand(pin: invalidPin);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("Mod-11 verification failed"));
    }

    [Theory]
    [InlineData("123456789018")] // Missing hyphens
    [InlineData("1-2345678901-8")] // Invalid first segment
    [InlineData("12-34567890-8")]  // 8 digits middle segment
    [InlineData("XX-XXXXXXXXX-X")] // Non-digits
    public void Validate_MalformedPinFormat_FailsRegexPattern(string malformedPin)
    {
        var command = CreateValidCommand(pin: malformedPin);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("RA 11223"));
    }

    [Fact]
    public void Validate_MissingRequiredFields_FailsValidation()
    {
        var command = new RegisterClinicPatientCommand(
            FirstName: "",
            LastName: " ",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: default,
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null
        );

        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(RegisterClinicPatientCommand.FirstName));
        result.Errors.Should().Contain(e => e.PropertyName == nameof(RegisterClinicPatientCommand.LastName));
        result.Errors.Should().Contain(e => e.PropertyName == nameof(RegisterClinicPatientCommand.DateOfBirth));
        result.Errors.Should().Contain(e => e.PropertyName == nameof(RegisterClinicPatientCommand.ContactNumber));
    }

    [Fact]
    public void Validate_FutureDateOfBirth_FailsValidation()
    {
        var futureDob = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(5));
        var command = CreateValidCommand() with { DateOfBirth = futureDob };
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(RegisterClinicPatientCommand.DateOfBirth));
    }

    [Fact]
    public void Validate_StructuredAllergies_MissingAllergenName_FailsValidation()
    {
        var allergies = new List<CreateAllergyRequest>
        {
            new(Category: "Medication", Allergen: "", Severity: "Severe")
        };
        var command = CreateValidCommand(allergies: allergies);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("Allergen name is required"));
    }

    [Fact]
    public void Validate_StructuredAllergies_Valid_PassesValidation()
    {
        var allergies = new List<CreateAllergyRequest>
        {
            new(Category: "Medication", Allergen: "Penicillin", Severity: "Severe", IsAnaphylactic: true),
            new(Category: "Food", Allergen: "Peanuts", Severity: "Moderate")
        };
        var command = CreateValidCommand(allergies: allergies);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }
}
