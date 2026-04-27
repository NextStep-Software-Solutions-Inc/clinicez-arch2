using FluentValidation;

namespace CLINICEZ.PhilHealth.Proxy.Features.Members.Commands.VerifyMember;

public sealed class VerifyMemberCommandValidator : AbstractValidator<VerifyMemberCommand>
{
    public VerifyMemberCommandValidator()
    {
        RuleFor(x => x.PhilHealthNumber)
            .NotEmpty()
                .WithMessage("PhilHealth Identification Number is required.")
            .Length(12)
                .WithMessage("PhilHealth Identification Number must be exactly 12 characters.")
            .Matches(@"^\d{2}-\d{9}-\d$")
                .WithMessage("PhilHealth Identification Number must follow the format: XX-XXXXXXXXX-X (e.g., 01-234567890-1).");

        RuleFor(x => x.LastName)
            .NotEmpty()
                .WithMessage("Last name is required.")
            .MaximumLength(100)
                .WithMessage("Last name must not exceed 100 characters.")
            .Matches(@"^[A-Za-z\s\-'ñÑ]+$")
                .WithMessage("Last name must contain only letters, spaces, hyphens, apostrophes, or ñ.");

        RuleFor(x => x.FirstName)
            .NotEmpty()
                .WithMessage("First name is required.")
            .MaximumLength(100)
                .WithMessage("First name must not exceed 100 characters.")
            .Matches(@"^[A-Za-z\s\-'ñÑ]+$")
                .WithMessage("First name must contain only letters, spaces, hyphens, apostrophes, or ñ.");

        When(x => x.DateOfBirth is not null, () =>
        {
            RuleFor(x => x.DateOfBirth!)
                .Matches(@"^\d{4}-\d{2}-\d{2}$")
                    .WithMessage("Date of birth must be in the format YYYY-MM-DD.")
                .Must(BeAValidDate)
                    .WithMessage("Date of birth is not a valid calendar date.");
        });
    }

    private static bool BeAValidDate(string value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", out _);
}
