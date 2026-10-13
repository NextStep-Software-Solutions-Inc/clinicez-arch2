using System;
using FluentAssertions;
using Xunit;
using ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;

namespace ClinicEz.Patient.Application.Tests.Features.Patients.Commands;

public sealed class ClaimIntakeCommandValidatorTests
{
    private readonly ClaimIntakeCommandValidator _validator = new();

    [Fact]
    public void Validate_WhenValidCommand_PassesValidation()
    {
        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_123",
            ClaimToken: "valid.claim.token",
            Sex: "Male");

        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenClerkUserIdEmpty_FailsValidation()
    {
        var command = new ClaimIntakeCommand(
            ClerkUserId: "",
            ClaimToken: "valid.claim.token");

        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "ClerkUserId");
    }

    [Fact]
    public void Validate_WhenClaimTokenEmpty_FailsValidation()
    {
        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_123",
            ClaimToken: "");

        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "ClaimToken");
    }

    [Fact]
    public void Validate_WhenInvalidSexEnum_FailsValidation()
    {
        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_123",
            ClaimToken: "valid.token",
            Sex: "NonExistentSex");

        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Sex");
    }

    [Fact]
    public void Validate_WhenPrincipalDobInFuture_FailsValidation()
    {
        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_123",
            ClaimToken: "valid.token",
            PrincipalDateOfBirth: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(5)));

        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "PrincipalDateOfBirth");
    }
}
