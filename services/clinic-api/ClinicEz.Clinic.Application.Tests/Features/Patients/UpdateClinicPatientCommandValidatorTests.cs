using System;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class UpdateClinicPatientCommandValidatorTests
{
    private readonly UpdateClinicPatientCommandValidator _validator = new();

    private static UpdateClinicPatientCommand CreateValidCommand(
        Guid? id = null,
        string firstName = "Maria",
        string lastName = "Santos",
        string? middleName = "Cruz",
        string? suffix = null,
        DateOnly? dateOfBirth = null,
        string gender = "Female",
        string? civilStatus = "Single",
        string contactNumber = "09171234567",
        string? email = "maria.santos@example.com",
        string? pin = "12-345678901-8") =>
        new(
            Id: id ?? Guid.NewGuid(),
            FirstName: firstName,
            LastName: lastName,
            MiddleName: middleName,
            Suffix: suffix,
            DateOfBirth: dateOfBirth ?? new DateOnly(1995, 5, 15),
            Gender: gender,
            CivilStatus: civilStatus,
            ContactNumber: contactNumber,
            Email: email,
            AddressLine: "456 Rizal Ave",
            Barangay: "Barangay 2",
            City: "Quezon City",
            Province: "Metro Manila",
            EmergencyContactName: "Pedro Santos",
            EmergencyContactPhone: "09181234567",
            EmergencyContactRelationship: "Father",
            PhilHealthNumber: pin,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "B+",
            Allergies: "Aspirin",
            ChronicConditions: "None",
            Alerts: null,
            CustomFields: null,
            VerificationStatus: "Verified"
        );

    // =========================================================================
    // 1. First & Last Names (Empty, Whitespace, MaxLength)
    // =========================================================================

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("   ")]
    [InlineData("\t")]
    [InlineData("\n")]
    public void Validate_EmptyOrWhitespaceFirstName_FailsValidation(string invalidFirstName)
    {
        var command = CreateValidCommand(firstName: invalidFirstName);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.FirstName)
            && e.ErrorMessage.Contains("First name is required"));
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("   ")]
    [InlineData("\t")]
    [InlineData("\n")]
    public void Validate_EmptyOrWhitespaceLastName_FailsValidation(string invalidLastName)
    {
        var command = CreateValidCommand(lastName: invalidLastName);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.LastName)
            && e.ErrorMessage.Contains("Last name is required"));
    }

    [Fact]
    public void Validate_FirstNameExceeding100Chars_FailsValidation()
    {
        var command = CreateValidCommand(firstName: new string('A', 101));
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.FirstName)
            && e.ErrorMessage.Contains("must not exceed 100 characters"));
    }

    [Fact]
    public void Validate_LastNameExceeding100Chars_FailsValidation()
    {
        var command = CreateValidCommand(lastName: new string('B', 101));
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.LastName)
            && e.ErrorMessage.Contains("must not exceed 100 characters"));
    }

    [Fact]
    public void Validate_ValidNames_PassesValidation()
    {
        var command = CreateValidCommand(firstName: "Juan", lastName: "Dela Cruz");
        var result = _validator.Validate(command);

        result.IsValid.Should().BeTrue();
    }

    // =========================================================================
    // 2. Date of Birth Boundaries
    // =========================================================================

    [Fact]
    public void Validate_EmptyDefaultDateOfBirth_FailsValidation()
    {
        var command = CreateValidCommand() with { DateOfBirth = default };
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.DateOfBirth)
            && e.ErrorMessage.Contains("Date of birth is required"));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    [InlineData(365)]
    public void Validate_FutureDateOfBirth_FailsValidation(int daysInFuture)
    {
        var futureDob = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(daysInFuture));
        var command = CreateValidCommand(dateOfBirth: futureDob);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.DateOfBirth)
            && e.ErrorMessage.Contains("cannot be in the future"));
    }

    [Fact]
    public void Validate_TodayDateOfBirth_PassesValidation()
    {
        var todayDob = DateOnly.FromDateTime(DateTime.UtcNow);
        var command = CreateValidCommand(dateOfBirth: todayDob);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_PastDateOfBirth_PassesValidation()
    {
        var pastDob = new DateOnly(1985, 12, 25);
        var command = CreateValidCommand(dateOfBirth: pastDob);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeTrue();
    }

    // =========================================================================
    // 3. PhilHealth PIN Mod-11 Checksum and Regex
    // =========================================================================

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

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t")]
    public void Validate_NullOrEmptyPin_PassesValidation(string? pin)
    {
        var command = CreateValidCommand(pin: pin);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("12-345678901-2")] // Invalid check digit (should be 8)
    [InlineData("01-025000001-9")] // Invalid check digit (should be 0)
    [InlineData("10-000000000-0")] // Invalid check digit (should be 5)
    public void Validate_InvalidCheckDigit_FailsMod11Verification(string invalidPin)
    {
        var command = CreateValidCommand(pin: invalidPin);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.PhilHealthNumber)
            && e.ErrorMessage.Contains("Mod-11 verification failed"));
    }

    [Theory]
    [InlineData("123456789018")] // Missing hyphens
    [InlineData("1-2345678901-8")] // Only 1 digit in first block
    [InlineData("12-34567890-8")]  // Only 8 digits in middle block
    [InlineData("12-3456789012-8")] // 10 digits in middle block
    [InlineData("XX-XXXXXXXXX-X")] // Non-digits
    [InlineData("12-345678901-89")] // 2 digits in check digit
    public void Validate_MalformedPinFormat_FailsRegexPattern(string malformedPin)
    {
        var command = CreateValidCommand(pin: malformedPin);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.PhilHealthNumber)
            && e.ErrorMessage.Contains("RA 11223"));
    }

    // =========================================================================
    // 4. Gender (Male, Female, Other vs Non-standard)
    // =========================================================================

    [Theory]
    [InlineData("Male")]
    [InlineData("Female")]
    [InlineData("Other")]
    public void Validate_StandardGender_PassesValidation(string validGender)
    {
        var command = CreateValidCommand(gender: validGender);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("male")]       // lowercase
    [InlineData("female")]     // lowercase
    [InlineData("other")]      // lowercase
    [InlineData("MALE")]       // uppercase
    [InlineData("FEMALE")]     // uppercase
    [InlineData("Non-Binary")] // non-standard
    [InlineData("Transgender")]// non-standard
    [InlineData("M")]          // abbreviation
    [InlineData("F")]          // abbreviation
    [InlineData("Unknown")]    // non-standard
    public void Validate_NonStandardGender_FailsValidation(string invalidGender)
    {
        var command = CreateValidCommand(gender: invalidGender);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.Gender)
            && e.ErrorMessage.Contains("Gender must be 'Male', 'Female', or 'Other'"));
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("   ")]
    public void Validate_EmptyOrWhitespaceGender_FailsValidation(string emptyGender)
    {
        var command = CreateValidCommand(gender: emptyGender);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.Gender));
    }

    // =========================================================================
    // 5. Contact Number Boundaries
    // =========================================================================

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("   ")]
    public void Validate_EmptyOrWhitespaceContactNumber_FailsValidation(string emptyContact)
    {
        var command = CreateValidCommand(contactNumber: emptyContact);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.ContactNumber)
            && e.ErrorMessage.Contains("Contact number is required"));
    }

    [Fact]
    public void Validate_ContactNumberExceeding30Chars_FailsValidation()
    {
        var command = CreateValidCommand(contactNumber: new string('0', 31));
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.ContactNumber)
            && e.ErrorMessage.Contains("must not exceed 30 characters"));
    }

    [Theory]
    [InlineData("09171234567")]
    [InlineData("+63 917 123 4567")]
    [InlineData("(02) 8123-4567")]
    [InlineData("+1-800-555-0199")]
    public void Validate_StandardContactNumbers_PassesValidation(string contact)
    {
        var command = CreateValidCommand(contactNumber: contact);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_ContactNumber_EvaluatesNonNumericInput()
    {
        // Adversarial check: since the validator only checks NotEmpty and MaxLength(30),
        // non-numeric string behaves according to existing contract (passes unless regex is added).
        var command = CreateValidCommand(contactNumber: "non-numeric-contact-123");
        var result = _validator.Validate(command);

        // Documenting exact behavior: does it pass or fail?
        // In the current implementation, Length <= 30 and NotEmpty, so it passes.
        result.IsValid.Should().BeTrue();
    }

    // =========================================================================
    // 6. Patient ID & Email Boundaries
    // =========================================================================

    [Fact]
    public void Validate_EmptyPatientId_FailsValidation()
    {
        var command = CreateValidCommand(id: Guid.Empty);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.Id)
            && e.ErrorMessage.Contains("Patient ID is required"));
    }

    [Fact]
    public void Validate_EmailExceeding255Chars_FailsValidation()
    {
        var longEmail = new string('a', 246) + "@domain.com"; // 257 chars
        var command = CreateValidCommand(email: longEmail);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.Email)
            && e.ErrorMessage.Contains("must not exceed 255 characters"));
    }

    [Theory]
    [InlineData("Male", "MAN")]
    [InlineData("Female", "WOMAN")]
    [InlineData("Intersex", "NON_BINARY")]
    [InlineData("Unknown", "PREFER_NOT_TO_ANSWER")]
    public void Validate_ValidBiologicalSexAndGenderIdentity_Passes(string sex, string genderIdentity)
    {
        var command = CreateValidCommand(gender: sex is "Male" or "Female" ? sex : "Other") with
        {
            Sex = sex,
            GenderIdentity = genderIdentity
        };
        var result = _validator.Validate(command);

        result.IsValid.Should().BeTrue();
        RegisterClinicPatientCommandHandler.ParseBiologicalSex(sex, command.Gender).ToString().Should().Be(sex);
    }

    [Fact]
    public void ParseCivilStatus_MapsCohabitingAndOtherLabelsCleanly()
    {
        RegisterClinicPatientCommandHandler.ParseCivilStatus("Cohabiting / Common-Law")
            .Should().Be(ClinicEz.Clinic.Domain.Enums.CivilStatus.Cohabiting);
        RegisterClinicPatientCommandHandler.ParseCivilStatus("Other Civil Status")
            .Should().Be(ClinicEz.Clinic.Domain.Enums.CivilStatus.Other);
    }
}
