using System;
using ClinicEz.Shared.Interop.Contracts;
using FluentValidation;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed class UpdateClinicSettingsCommandValidator : AbstractValidator<UpdateClinicSettingsCommand>
{
    public UpdateClinicSettingsCommandValidator()
    {
        When(x => x.TeleconsultRecordingPolicy != null, () =>
        {
            RuleFor(x => x.TeleconsultRecordingPolicy!)
                .Must(p => !string.IsNullOrWhiteSpace(p) &&
                           (p.Trim().Equals("Disabled", StringComparison.OrdinalIgnoreCase) ||
                            p.Trim().Equals("WorkspaceVaultOnly", StringComparison.OrdinalIgnoreCase) ||
                            p.Trim().Equals("Both", StringComparison.OrdinalIgnoreCase) ||
                            p.Trim().Equals("LocalDeviceOnly", StringComparison.OrdinalIgnoreCase)))
                .OverridePropertyName(nameof(UpdateClinicSettingsCommand.TeleconsultRecordingPolicy))
                .WithMessage("TeleconsultRecordingPolicy must be 'Disabled', 'WorkspaceVaultOnly', 'Both', or 'LocalDeviceOnly'.");
        });

        When(x => x.TeleconsultRecordingRetentionDays.HasValue, () =>
        {
            RuleFor(x => x.TeleconsultRecordingRetentionDays!.Value)
                .GreaterThanOrEqualTo(0)
                .OverridePropertyName(nameof(UpdateClinicSettingsCommand.TeleconsultRecordingRetentionDays))
                .WithMessage("TeleconsultRecordingRetentionDays must be greater than or equal to 0.");
        });

        When(x => x.TeleconsultPaymentPolicy.HasValue, () =>
        {
            RuleFor(x => x.TeleconsultPaymentPolicy!.Value)
                .IsInEnum()
                .OverridePropertyName(nameof(UpdateClinicSettingsCommand.TeleconsultPaymentPolicy))
                .WithMessage("TeleconsultPaymentPolicy must be 'Prepaid', 'Postpaid', or 'Exempt'.");
        });

        When(x => x.TeleconsultDefaultFee.HasValue, () =>
        {
            RuleFor(x => x.TeleconsultDefaultFee!.Value)
                .GreaterThanOrEqualTo(0)
                .OverridePropertyName(nameof(UpdateClinicSettingsCommand.TeleconsultDefaultFee))
                .WithMessage("TeleconsultDefaultFee must be greater than or equal to 0.");
        });
    }
}
