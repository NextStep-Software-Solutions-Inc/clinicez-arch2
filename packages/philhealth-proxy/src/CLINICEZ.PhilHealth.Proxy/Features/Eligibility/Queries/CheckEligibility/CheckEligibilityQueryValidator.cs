using FluentValidation;

namespace CLINICEZ.PhilHealth.Proxy.Features.Eligibility.Queries.CheckEligibility;

public sealed class CheckEligibilityQueryValidator : AbstractValidator<CheckEligibilityQuery>
{
    public CheckEligibilityQueryValidator()
    {
        RuleFor(x => x.PhilHealthNumber)
            .NotEmpty()
                .WithMessage("PhilHealth Identification Number is required.")
            .Length(12)
                .WithMessage("PhilHealth Identification Number must be exactly 12 characters.")
            .Matches(@"^\d{2}-\d{9}-\d$")
                .WithMessage("PhilHealth Identification Number must follow the format: XX-XXXXXXXXX-X (e.g., 01-234567890-1).");

        RuleFor(x => x.FacilityAccreditationNumber)
            .NotEmpty()
                .WithMessage("Facility Accreditation Number is required.")
            .MaximumLength(20)
                .WithMessage("Facility Accreditation Number must not exceed 20 characters.");

        RuleFor(x => x.ConsultationDate)
            .NotEmpty()
                .WithMessage("Consultation date is required.")
            .Matches(@"^\d{4}-\d{2}-\d{2}$")
                .WithMessage("Consultation date must be in the format YYYY-MM-DD.")
            .Must(BeAValidDate)
                .WithMessage("Consultation date is not a valid calendar date.")
            .Must(NotBeInTheFuture)
                .WithMessage("Consultation date cannot be in the future.");

        RuleFor(x => x.DiagnosisCodes)
            .NotNull()
                .WithMessage("At least one diagnosis code is required.")
            .NotEmpty()
                .WithMessage("At least one diagnosis code is required.")
            .Must(codes => codes.Count <= 10)
                .WithMessage("A maximum of 10 diagnosis codes is allowed per consultation.");

        RuleForEach(x => x.DiagnosisCodes)
            .NotEmpty()
                .WithMessage("Diagnosis code must not be empty.")
            .MaximumLength(10)
                .WithMessage("Each diagnosis code must not exceed 10 characters.")
            .Matches(@"^[A-Z0-9\.]+$")
                .WithMessage("Diagnosis codes must follow ICD-10 format (e.g., A09, J00, Z23.1).");
    }

    private static bool BeAValidDate(string value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", out _);

    private static bool NotBeInTheFuture(string value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", out var date) && date <= DateOnly.FromDateTime(DateTime.UtcNow);
}
