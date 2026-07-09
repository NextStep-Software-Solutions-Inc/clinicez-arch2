using FluentValidation;
using PatientApp.Application.Common.Errors;

namespace PatientApp.Application.Features.Appointments.Queries.GetAppointments;

public sealed class GetAppointmentsQueryValidator : AbstractValidator<GetAppointmentsQuery>
{
    public GetAppointmentsQueryValidator()
    {
        RuleFor(x => x.PatientId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);
    }
}
