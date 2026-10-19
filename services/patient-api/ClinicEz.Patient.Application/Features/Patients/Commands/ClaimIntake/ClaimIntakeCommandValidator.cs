using System;
using FluentValidation;
using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;

public sealed class ClaimIntakeCommandValidator : AbstractValidator<ClaimIntakeCommand>
{
    public ClaimIntakeCommandValidator()
    {
        RuleFor(x => x.ClerkUserId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(128).WithErrorCode(ErrorCodes.FieldTooLong);

        RuleFor(x => x.ClaimToken)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);

        RuleFor(x => x.Sex)
            .Must(s => Enum.TryParse<SexType>(s, true, out _))
            .WithErrorCode(ErrorCodes.InvalidEnumValue)
            .WithMessage($"Sex must be one of: {string.Join(", ", Enum.GetNames<SexType>())}")
            .When(x => !string.IsNullOrWhiteSpace(x.Sex));

        RuleFor(x => x.PrincipalDateOfBirth)
            .LessThanOrEqualTo(DateOnly.FromDateTime(DateTime.UtcNow))
            .WithErrorCode(ErrorCodes.FutureDateNotAllowed)
            .When(x => x.PrincipalDateOfBirth.HasValue);
    }
}
