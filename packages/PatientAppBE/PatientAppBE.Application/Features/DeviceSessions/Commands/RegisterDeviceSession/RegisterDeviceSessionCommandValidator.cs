using FluentValidation;
using PatientAppBE.Application.Common.Errors;

namespace PatientAppBE.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;

public sealed class RegisterDeviceSessionCommandValidator : AbstractValidator<RegisterDeviceSessionCommand>
{
    public RegisterDeviceSessionCommandValidator()
    {
        RuleFor(x => x.PatientId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);

        RuleFor(x => x.DeviceId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(128).WithErrorCode(ErrorCodes.FieldTooLong);

        RuleFor(x => x.DeviceLabel)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(200).WithErrorCode(ErrorCodes.FieldTooLong);

        RuleFor(x => x.ClerkSessionId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
            .MaximumLength(256).WithErrorCode(ErrorCodes.FieldTooLong);
    }
}
