using FluentAssertions;
using ClinicEz.Patient.Application.Features.Patients.Commands.UpdatePatientDemographics;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Patients.Commands;

public sealed class UpdatePatientDemographicsCommandValidatorTests
{
    private readonly UpdatePatientDemographicsCommandValidator _validator = new();

    [Theory]
    [InlineData("A+")]
    [InlineData("A-")]
    [InlineData("B+")]
    [InlineData("B-")]
    [InlineData("AB+")]
    [InlineData("AB-")]
    [InlineData("O+")]
    [InlineData("O-")]
    [InlineData("Unknown")]
    [InlineData("APositive")]
    [InlineData("BNegative")]
    [InlineData(null)]
    public void Validator_ShouldAcceptValidBloodTypes(string? bloodType)
    {
        var command = new UpdatePatientDemographicsCommand(
            Guid.NewGuid(),
            "Juan",
            null,
            "Dela Cruz",
            null,
            "Male",
            null,
            null,
            "Single",
            bloodType,
            "Filipino",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            false);

        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_ShouldRejectInvalidBloodType()
    {
        var command = new UpdatePatientDemographicsCommand(
            Guid.NewGuid(),
            "Juan",
            null,
            "Dela Cruz",
            null,
            "Male",
            null,
            null,
            "Single",
            "InvalidType",
            "Filipino",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            false);

        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "BloodType");
    }
}
