using FluentValidation;
using PatientAppBE.Application.Common.Errors;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Application.Features.Patients.Commands.UpdatePatientDemographics;

public sealed class UpdatePatientDemographicsCommandValidator : AbstractValidator<UpdatePatientDemographicsCommand>
{
    public UpdatePatientDemographicsCommandValidator()
    {
        RuleFor(x => x.PatientId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);

        RuleFor(x => x.FirstName)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(100).WithErrorCode(ErrorCodes.FieldTooLong);

        RuleFor(x => x.LastName)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(100).WithErrorCode(ErrorCodes.FieldTooLong);

        RuleFor(x => x.MiddleName)
            .MaximumLength(100).WithErrorCode(ErrorCodes.FieldTooLong)
            .When(x => x.MiddleName is not null);

        RuleFor(x => x.Sex)
            .Must(s => Enum.TryParse<SexType>(s, true, out _))
            .WithErrorCode(ErrorCodes.InvalidEnumValue)
            .When(x => x.Sex is not null);

        RuleFor(x => x.CivilStatus)
            .Must(s => Enum.TryParse<CivilStatus>(s, true, out _))
            .WithErrorCode(ErrorCodes.InvalidEnumValue)
            .When(x => x.CivilStatus is not null);

        RuleFor(x => x.BloodType)
            .Must(s => Enum.TryParse<BloodType>(s, true, out _))
            .WithErrorCode(ErrorCodes.InvalidEnumValue)
            .When(x => x.BloodType is not null);

        RuleFor(x => x.Email)
            .EmailAddress().WithErrorCode(ErrorCodes.InvalidFieldFormat)
            .MaximumLength(254).WithErrorCode(ErrorCodes.FieldTooLong)
            .When(x => x.Email is not null);

        RuleFor(x => x.DateOfBirth)
            .LessThan(DateOnly.FromDateTime(DateTime.UtcNow))
            .WithErrorCode(ErrorCodes.FutureDateNotAllowed)
            .When(x => x.DateOfBirth.HasValue);
    }
}
