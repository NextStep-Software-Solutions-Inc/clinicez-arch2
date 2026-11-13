using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

public class UpdateClinicSettingsCommandValidatorTests
{
    private readonly UpdateClinicSettingsCommandValidator _validator = new();

    #region TeleconsultRecordingPolicy

    [Theory]
    [InlineData("Disabled")]
    [InlineData("WorkspaceVaultOnly")]
    [InlineData("Both")]
    [InlineData("LocalDeviceOnly")]
    [InlineData("disabled")]
    [InlineData("both")]
    public void Validate_ValidRecordingPolicy_PassesValidation(string validPolicy)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingPolicy: validPolicy);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_NullRecordingPolicy_PassesValidation()
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingPolicy: null);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("InvalidPolicy")]
    [InlineData("CloudOnly")]
    [InlineData("LocalOnly")]
    [InlineData("")]
    [InlineData("   ")]
    public void Validate_InvalidRecordingPolicy_FailsValidation(string invalidPolicy)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingPolicy: invalidPolicy);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultRecordingPolicy));
    }

    #endregion

    #region TeleconsultRecordingRetentionDays

    [Theory]
    [InlineData(0)]   // Indefinite
    [InlineData(30)]
    [InlineData(90)]
    [InlineData(365)]
    [InlineData(3650)]
    public void Validate_ValidRetentionDays_PassesValidation(int validDays)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingRetentionDays: validDays);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_NullRetentionDays_PassesValidation()
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingRetentionDays: null);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(-30)]
    [InlineData(-90)]
    [InlineData(-365)]
    public void Validate_NegativeRetentionDays_FailsValidation(int negativeDays)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultRecordingRetentionDays: negativeDays);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultRecordingRetentionDays));
    }

    #endregion

    #region TeleconsultPaymentPolicy

    [Theory]
    [InlineData(TeleconsultPaymentPolicy.Prepaid)]
    [InlineData(TeleconsultPaymentPolicy.Postpaid)]
    [InlineData(TeleconsultPaymentPolicy.Exempt)]
    public void Validate_ValidPaymentPolicy_PassesValidation(TeleconsultPaymentPolicy validPolicy)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultPaymentPolicy: validPolicy);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_NullPaymentPolicy_PassesValidation()
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultPaymentPolicy: null);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_InvalidPaymentPolicy_FailsValidation()
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultPaymentPolicy: (TeleconsultPaymentPolicy)999);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultPaymentPolicy));
    }

    #endregion

    #region TeleconsultDefaultFee

    [Theory]
    [InlineData(0.00)]
    [InlineData(400.00)]
    [InlineData(1250.50)]
    [InlineData(10000.00)]
    public void Validate_ValidDefaultFee_PassesValidation(decimal validFee)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultDefaultFee: validFee);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_NullDefaultFee_PassesValidation()
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultDefaultFee: null);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(-1.00)]
    [InlineData(-500.00)]
    public void Validate_NegativeDefaultFee_FailsValidation(decimal negativeFee)
    {
        var command = new UpdateClinicSettingsCommand(TeleconsultDefaultFee: negativeFee);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultDefaultFee));
    }

    #endregion

    #region Composite Validations

    [Fact]
    public void Validate_MultipleInvalidTeleconsultProperties_ReturnsErrorsForAllFailedRules()
    {
        var command = new UpdateClinicSettingsCommand(
            TeleconsultRecordingPolicy: "BogusPolicy",
            TeleconsultRecordingRetentionDays: -10,
            TeleconsultPaymentPolicy: (TeleconsultPaymentPolicy)999,
            TeleconsultDefaultFee: -50.00m
        );

        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().HaveCount(4);
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultRecordingPolicy));
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultRecordingRetentionDays));
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultPaymentPolicy));
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.TeleconsultDefaultFee));
    }

    [Fact]
    public void Validate_DefaultCleanCommand_PassesValidation()
    {
        var command = new UpdateClinicSettingsCommand(ClinicName: "Clean Clinic");
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    #endregion
}
