using FluentValidation;
using PatientApp.Application.Common.Errors;

namespace PatientApp.Application.Features.Appointments.Queries.GetClinicAppointments;

public sealed class GetClinicAppointmentsQueryValidator : AbstractValidator<GetClinicAppointmentsQuery>
{
    public GetClinicAppointmentsQueryValidator()
    {
        RuleFor(x => x.PatientId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);

        RuleFor(x => x.ClinicBaseUrl)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .Must(url => Uri.TryCreate(url, UriKind.Absolute, out var uri)
                         && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
            .WithErrorCode(ErrorCodes.InvalidFieldFormat)
            .WithMessage("ClinicBaseUrl must be a valid HTTP or HTTPS URL.");

        RuleFor(x => x.BearerToken)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);
    }
}
