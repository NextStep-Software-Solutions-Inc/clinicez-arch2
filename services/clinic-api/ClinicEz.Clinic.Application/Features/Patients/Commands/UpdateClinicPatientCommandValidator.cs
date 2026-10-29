using System;
using System.Text.RegularExpressions;
using FluentValidation;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed class UpdateClinicPatientCommandValidator : AbstractValidator<UpdateClinicPatientCommand>
{
    private static readonly Regex PinRegex = new(@"^\d{2}-\d{9}-\d{1}$", RegexOptions.Compiled);

    public UpdateClinicPatientCommandValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty().WithMessage("Patient ID is required.");

        RuleFor(x => x.FirstName)
            .NotEmpty().WithMessage("First name is required.")
            .MaximumLength(100).WithMessage("First name must not exceed 100 characters.");

        RuleFor(x => x.LastName)
            .NotEmpty().WithMessage("Last name is required.")
            .MaximumLength(100).WithMessage("Last name must not exceed 100 characters.");

        RuleFor(x => x.DateOfBirth)
            .NotEmpty().WithMessage("Date of birth is required.")
            .LessThanOrEqualTo(DateOnly.FromDateTime(DateTime.UtcNow))
            .WithMessage("Date of birth cannot be in the future.");

        RuleFor(x => x.ContactNumber)
            .NotEmpty().WithMessage("Contact number is required.")
            .MaximumLength(30).WithMessage("Contact number must not exceed 30 characters.");

        RuleFor(x => x.Gender)
            .NotEmpty().WithMessage("Gender is required.")
            .Must(g => g is "Male" or "Female" or "Other")
            .WithMessage("Gender must be 'Male', 'Female', or 'Other'.");

        When(x => !string.IsNullOrWhiteSpace(x.PhilHealthNumber), () =>
        {
            RuleFor(x => x.PhilHealthNumber!)
                .Must(pin => PinRegex.IsMatch(pin.Trim()))
                .WithMessage("PhilHealth Identification Number must follow the 12-digit format 'XX-XXXXXXXXX-X' per RA 11223.")
                .Must(pin => !pin.Replace("-", "").Replace(" ", "").Trim().All(c => c == '0'))
                .WithMessage("PhilHealth Identification Number cannot be all zeros (unassigned placeholder).")
                .Must(RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11)
                .WithMessage("PhilHealth Identification Number check digit is invalid (Mod-11 verification failed).");
        });

        When(x => !string.IsNullOrWhiteSpace(x.Email), () =>
        {
            RuleFor(x => x.Email!)
                .MaximumLength(255).WithMessage("Email must not exceed 255 characters.");
        });
    }
}
