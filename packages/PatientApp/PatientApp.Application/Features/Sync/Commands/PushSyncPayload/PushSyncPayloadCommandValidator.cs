using FluentValidation;
using PatientApp.Application.Common.Constants;
using PatientApp.Application.Common.Errors;

namespace PatientApp.Application.Features.Sync.Commands.PushSyncPayload;

public sealed class PushSyncPayloadCommandValidator : AbstractValidator<PushSyncPayloadCommand>
{
    private static readonly TimeSpan FutureClockSkewTolerance = TimeSpan.FromMinutes(5);

    public PushSyncPayloadCommandValidator()
    {
        RuleFor(x => x.PatientId)
            .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);

        RuleFor(x => x.Items)
            .NotEmpty().WithErrorCode(ErrorCodes.CollectionEmpty)
            .Must(items => items.Count <= 500)
            .WithErrorCode(ErrorCodes.CollectionTooLarge)
            .WithMessage("Sync payload must not exceed 500 items per request.");

        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.ClientId)
                .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing);

            item.RuleFor(i => i.EntityType)
                .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
                .Must(SyncableEntityTypes.All.Contains)
                .WithErrorCode(ErrorCodes.SyncEntityTypeUnknown)
                .WithMessage(t => $"Entity type '{t}' is not a syncable type.");

            item.RuleFor(i => i.ClientTimestamp)
                .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
                .Must(ts => ts.Kind == DateTimeKind.Utc)
                .WithErrorCode(ErrorCodes.InvalidFieldFormat)
                .WithMessage("ClientTimestamp must be UTC.")
                .Must(ts => ts <= DateTime.UtcNow.Add(FutureClockSkewTolerance))
                .WithErrorCode(ErrorCodes.FutureDateNotAllowed)
                .WithMessage("ClientTimestamp cannot be more than 5 minutes in the future.");

            item.RuleFor(i => i.PayloadJson)
                .NotEmpty().WithErrorCode(ErrorCodes.RequiredFieldMissing)
                .WithMessage("PayloadJson is required for Create and Update operations.")
                .When(i => i.Operation != Domain.Enums.SyncOperation.Delete);
        });
    }
}
