using FluentValidation;
using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.CreatePatient;

public sealed class CreatePatientCommandValidator : AbstractValidator<CreatePatientCommand>
{
    public CreatePatientCommandValidator()
    {
        RuleFor(x => x.ClerkUserId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(128).WithErrorCode(ErrorCodes.FieldTooLong);

        RuleFor(x => x.FirstName)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(100).WithErrorCode(ErrorCodes.FieldTooLong);

        RuleFor(x => x.LastName)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(100).WithErrorCode(ErrorCodes.FieldTooLong);

        RuleFor(x => x.MiddleName)
            .MaximumLength(100).WithErrorCode(ErrorCodes.FieldTooLong)
            .When(x => x.MiddleName is not null);

        RuleFor(x => x.Suffix)
            .MaximumLength(20).WithErrorCode(ErrorCodes.FieldTooLong)
            .When(x => x.Suffix is not null);

        RuleFor(x => x.Sex)
            .Must(s => Enum.TryParse<SexType>(s, true, out _))
            .WithErrorCode(ErrorCodes.InvalidEnumValue)
            .WithMessage($"Sex must be one of: {string.Join(", ", Enum.GetNames<SexType>())}")
            .When(x => x.Sex is not null);

        RuleFor(x => x.DateOfBirth)
            .LessThan(DateOnly.FromDateTime(DateTime.UtcNow))
            .WithErrorCode(ErrorCodes.FutureDateNotAllowed)
            .When(x => x.DateOfBirth.HasValue);
    }
}
