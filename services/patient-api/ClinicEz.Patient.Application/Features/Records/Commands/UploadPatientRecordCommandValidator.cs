using ClinicEz.Patient.Application.Features.Documents;
using FluentValidation;

namespace ClinicEz.Patient.Application.Features.Records.Commands;

public sealed class UploadPatientRecordCommandValidator : AbstractValidator<UploadPatientRecordCommand>
{
    public UploadPatientRecordCommandValidator()
    {
        RuleFor(x => x.PatientId)
            .NotEmpty().WithMessage("Patient ID is required.");

        RuleFor(x => x.DocumentTypeId)
            .NotEmpty().WithMessage("Document Type ID is required.");

        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Title is required.")
            .MaximumLength(200).WithMessage("Title cannot exceed 200 characters.");

        RuleFor(x => x.FileName)
            .NotEmpty().WithMessage("File name is required.")
            .MaximumLength(255).WithMessage("File name cannot exceed 255 characters.");

        RuleFor(x => x.FacilityName)
            .MaximumLength(200).WithMessage("Facility name cannot exceed 200 characters.");

        RuleFor(x => x.Notes)
            .MaximumLength(1000).WithMessage("Notes cannot exceed 1000 characters.");

        RuleFor(x => x.SizeBytes)
            .GreaterThan(0).WithMessage("File cannot be empty.")
            .LessThanOrEqualTo(PatientFileLimits.MaxFileBytes)
            .WithMessage($"File size cannot exceed {PatientFileLimits.MaxFileBytes / (1024 * 1024)} MB.");

        RuleFor(x => x.ContentType)
            .Must(PatientFileLimits.IsPdfOrImage)
            .WithMessage("Only PDF, JPEG, PNG, HEIC and WEBP files are accepted.");
    }
}
