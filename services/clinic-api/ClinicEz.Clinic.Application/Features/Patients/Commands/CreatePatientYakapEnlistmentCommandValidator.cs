using System;
using ClinicEz.Clinic.Domain.Enums;
using FluentValidation;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed class CreatePatientYakapEnlistmentCommandValidator : AbstractValidator<CreatePatientYakapEnlistmentCommand>
{
    public CreatePatientYakapEnlistmentCommandValidator()
    {
        RuleFor(x => x.PatientId)
            .NotEmpty().WithMessage("Patient ID is required.");

        RuleFor(x => x.EffectiveYear)
            .InclusiveBetween(2020, 2100)
            .WithMessage("Effective year must be between 2020 and 2100.");

        RuleFor(x => x.EnlistmentDate)
            .NotEmpty().WithMessage("Enlistment date is required.");

        When(x => x.ValidUntil.HasValue, () =>
        {
            RuleFor(x => x.ValidUntil!.Value)
                .GreaterThanOrEqualTo(x => x.EnlistmentDate)
                .WithMessage("Valid until date must be on or after the enlistment date.");
        });

        When(x => !string.IsNullOrWhiteSpace(x.Source), () =>
        {
            RuleFor(x => x.Source!)
                .Must(s => Enum.TryParse<YakapEnlistmentSource>(s.Trim(), ignoreCase: true, out var parsed) && Enum.IsDefined(parsed))
                .WithMessage("Invalid YAKAP enlistment source.");
        });

        When(x => !string.IsNullOrWhiteSpace(x.PackageType), () =>
        {
            RuleFor(x => x.PackageType!)
                .Must(p => Enum.TryParse<YakapPackageType>(p.Trim(), ignoreCase: true, out var parsed) && Enum.IsDefined(parsed))
                .WithMessage("Invalid YAKAP package type.");
        });

        When(x => !string.IsNullOrWhiteSpace(x.CaseNo), () =>
            RuleFor(x => x.CaseNo!.Trim()).MaximumLength(50));

        When(x => !string.IsNullOrWhiteSpace(x.EnlistmentTransNo), () =>
            RuleFor(x => x.EnlistmentTransNo!.Trim()).MaximumLength(50));

        When(x => !string.IsNullOrWhiteSpace(x.YesReferenceNo), () =>
            RuleFor(x => x.YesReferenceNo!.Trim()).MaximumLength(10));

        When(x => !string.IsNullOrWhiteSpace(x.Notes), () =>
            RuleFor(x => x.Notes!.Trim()).MaximumLength(500));
    }
}
