using FluentValidation;
using ClinicEz.Patient.Application.Common.Errors;

namespace ClinicEz.Patient.Application.Features.Appointments.Queries.GetAppointments;

public sealed class GetAppointmentsQueryValidator : AbstractValidator<GetAppointmentsQuery>
{
    public GetAppointmentsQueryValidator()
    {
        RuleFor(x => x.PatientId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);
    }
}
