using System;
using System.Linq;
using System.Text.RegularExpressions;
using FluentValidation;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed class RegisterClinicPatientCommandValidator : AbstractValidator<RegisterClinicPatientCommand>
{
    private static readonly int[] Mod11Weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    private static readonly Regex PinRegex = new(@"^\d{2}-\d{9}-\d{1}$", RegexOptions.Compiled);

    public RegisterClinicPatientCommandValidator()
    {
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

        When(x => !string.IsNullOrWhiteSpace(x.PhilHealthNumber), () =>
        {
            RuleFor(x => x.PhilHealthNumber!)
                .Must(pin => PinRegex.IsMatch(pin.Trim()))
                .WithMessage("PhilHealth Identification Number must follow the 12-digit format 'XX-XXXXXXXXX-X' per RA 11223.")
                .Must(BeValidPhilHealthMod11)
                .WithMessage("PhilHealth Identification Number check digit is invalid (Mod-11 verification failed).");
        });

        When(x => x.StructuredAllergies != null && x.StructuredAllergies.Count > 0, () =>
        {
            RuleForEach(x => x.StructuredAllergies!).ChildRules(allergy =>
            {
                allergy.RuleFor(a => a.Allergen)
                    .NotEmpty().WithMessage("Allergen name is required when submitting structured allergy.")
                    .MaximumLength(150).WithMessage("Allergen name cannot exceed 150 characters.");
            });
        });
    }

    public static bool BeValidPhilHealthMod11(string pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;

        var cleaned = pin.Replace("-", "").Replace(" ", "").Trim();
        if (cleaned.Length != 12 || !cleaned.All(char.IsAsciiDigit)) return false;

        int sum = 0;
        for (int i = 0; i < 11; i++)
        {
            sum += (cleaned[i] - '0') * Mod11Weights[i];
        }

        int remainder = sum % 11;
        int expectedCheckDigit = (11 - remainder) % 11;
        int actualCheckDigit = cleaned[11] - '0';

        // Check digit 10 can be represented as 0 in modulus 11
        if (expectedCheckDigit == 10 && actualCheckDigit == 0)
            return true;

        return expectedCheckDigit == actualCheckDigit;
    }
}
