using System;
using System.Linq;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Domain.Enums;
using FluentValidation;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed class UpsertPatientPhilHealthMembershipCommandValidator : AbstractValidator<UpsertPatientPhilHealthMembershipCommand>
{
    private static readonly Regex FormattedPinRegex = new(@"^\d{2}-\d{9}-\d{1}$", RegexOptions.Compiled);
    private static readonly Regex RawPinRegex = new(@"^\d{12}$", RegexOptions.Compiled);

    public UpsertPatientPhilHealthMembershipCommandValidator()
    {
        RuleFor(x => x.PatientId)
            .NotEmpty().WithMessage("Patient ID is required.");

        RuleFor(x => x.MemberType)
            .NotEmpty().WithMessage("PhilHealth member type is required.")
            .Must(mt => Enum.TryParse<PhilHealthMemberType>(mt?.Trim(), ignoreCase: true, out var parsed) && Enum.IsDefined(parsed))
            .WithMessage("Member type must be 'MM' (Member) or 'DD' (Dependent).");

        When(x => !string.IsNullOrWhiteSpace(x.PhilHealthPin), () =>
        {
            RuleFor(x => x.PhilHealthPin!)
                .MaximumLength(20)
                .Must(IsValidPinFormat)
                .WithMessage("PhilHealth PIN must follow the 12-digit format 'XX-XXXXXXXXX-X'.")
                .Must(pin => !IsAllZeros(pin))
                .WithMessage("PhilHealth PIN cannot be all zeros.")
                .Must(RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11)
                .WithMessage("PhilHealth PIN check digit is invalid (Mod-11 verification failed).");
        });

        When(x => !string.IsNullOrWhiteSpace(x.PrincipalMemberPin), () =>
        {
            RuleFor(x => x.PrincipalMemberPin!)
                .MaximumLength(20)
                .Must(IsValidPinFormat)
                .WithMessage("Principal member PIN must follow the 12-digit format 'XX-XXXXXXXXX-X'.")
                .Must(pin => !IsAllZeros(pin))
                .WithMessage("Principal member PIN cannot be all zeros.")
                .Must(RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11)
                .WithMessage("Principal member PIN check digit is invalid (Mod-11 verification failed).");
        });

        When(x => string.Equals(x.MemberType?.Trim(), "DD", StringComparison.OrdinalIgnoreCase), () =>
        {
            RuleFor(x => x.DependentRelationship)
                .NotEmpty().WithMessage("Dependent relationship is required when member type is 'DD'.")
                .Must(rel => Enum.TryParse<PhilHealthDependentRelationship>(rel?.Trim(), ignoreCase: true, out var parsed) && Enum.IsDefined(parsed))
                .WithMessage("Dependent relationship must be S (Spouse), C (Child), P (Parent), or D (Disabled).");

            RuleFor(x => x.PrincipalMemberPin)
                .NotEmpty().WithMessage("Principal member PIN is required for dependents ('DD').")
                .Must((cmd, principalPin) =>
                {
                    if (string.IsNullOrWhiteSpace(cmd.PhilHealthPin) || string.IsNullOrWhiteSpace(principalPin))
                        return true;
                    var pDigits = ClinicEz.Clinic.Domain.Entities.PhilHealthPinNormalizer.Normalize(cmd.PhilHealthPin);
                    var sDigits = ClinicEz.Clinic.Domain.Entities.PhilHealthPinNormalizer.Normalize(principalPin);
                    return pDigits == null || sDigits == null || pDigits != sDigits;
                })
                .WithMessage("Principal member PIN cannot be the same as the patient's own PhilHealth PIN.");

            RuleFor(x => x.PrincipalLastName)
                .NotEmpty().WithMessage("Principal member last name is required for dependents ('DD').")
                .MaximumLength(100);

            RuleFor(x => x.PrincipalFirstName)
                .NotEmpty().WithMessage("Principal member first name is required for dependents ('DD').")
                .MaximumLength(100);

            RuleFor(x => x.PrincipalDateOfBirth)
                .NotNull().WithMessage("Principal member date of birth is required for dependents ('DD').")
                .Must(dob => !dob.HasValue || dob.Value <= DateOnly.FromDateTime(DateTime.UtcNow))
                .WithMessage("Principal member date of birth cannot be in the future.");
        });

        When(x => !string.IsNullOrWhiteSpace(x.PrincipalMiddleName), () =>
            RuleFor(x => x.PrincipalMiddleName!).MaximumLength(100));
        When(x => !string.IsNullOrWhiteSpace(x.PrincipalSuffix), () =>
            RuleFor(x => x.PrincipalSuffix!).MaximumLength(20));
        When(x => !string.IsNullOrWhiteSpace(x.PrincipalSex), () =>
            RuleFor(x => x.PrincipalSex!).Must(RegisterClinicPatientCommandValidator.BeValidPhilHealthSex)
            .WithMessage("Principal sex must be 'Male' or 'Female'."));
        When(x => !string.IsNullOrWhiteSpace(x.MembershipCategoryCode), () =>
            RuleFor(x => x.MembershipCategoryCode!).MaximumLength(50));
        When(x => !string.IsNullOrWhiteSpace(x.MembershipCategoryDesc), () =>
            RuleFor(x => x.MembershipCategoryDesc!).MaximumLength(200));
        When(x => !string.IsNullOrWhiteSpace(x.EmployerPin), () =>
            RuleFor(x => x.EmployerPin!).MaximumLength(20));
        When(x => !string.IsNullOrWhiteSpace(x.EmployerName), () =>
            RuleFor(x => x.EmployerName!).MaximumLength(200));
        When(x => !string.IsNullOrWhiteSpace(x.DefaultWalkInAtc), () =>
            RuleFor(x => x.DefaultWalkInAtc!).MaximumLength(50));
        When(x => !string.IsNullOrWhiteSpace(x.PrincipalMemberLandlineNumber), () =>
            RuleFor(x => x.PrincipalMemberLandlineNumber!).MaximumLength(30));
        When(x => !string.IsNullOrWhiteSpace(x.PrincipalMemberMobileNumber), () =>
            RuleFor(x => x.PrincipalMemberMobileNumber!).MaximumLength(30));
        When(x => !string.IsNullOrWhiteSpace(x.PrincipalMemberEmail), () =>
            RuleFor(x => x.PrincipalMemberEmail!).MaximumLength(150));
    }

    private static bool IsValidPinFormat(string pin)
    {
        var trimmed = pin.Trim();
        return FormattedPinRegex.IsMatch(trimmed) || RawPinRegex.IsMatch(trimmed);
    }

    private static bool IsAllZeros(string pin)
    {
        var digits = pin.Replace("-", "").Replace(" ", "").Trim();
        return digits.Length > 0 && digits.All(c => c == '0');
    }
}
