using System;
using System.Linq;
using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Admin.Commands.RecordManualPayment;

public class RecordManualPaymentCommandValidator : AbstractValidator<RecordManualPaymentCommand>
{
    private static readonly string[] AllowedMethods =
    [
        "Bank Transfer",
        "GCash/Maya",
        "GCash",
        "Maya",
        "Check",
        "Cash",
        "Promotional"
    ];

    public RecordManualPaymentCommandValidator()
    {
        RuleFor(x => x.TenantId)
            .NotEmpty().WithMessage("TenantId is required.");

        RuleFor(x => x.PlanSlug)
            .NotEmpty().WithMessage("PlanSlug is required.");

        RuleFor(x => x.PaymentMethod)
            .NotEmpty().WithMessage("PaymentMethod is required.")
            .Must(m => AllowedMethods.Contains(m, StringComparer.OrdinalIgnoreCase))
            .WithMessage($"PaymentMethod must be one of: {string.Join(", ", AllowedMethods)}.");

        RuleFor(x => x.Amount)
            .GreaterThanOrEqualTo(0).WithMessage("Amount must be greater than or equal to 0.");

        RuleFor(x => x.Amount)
            .GreaterThan(0)
            .When(x => !string.Equals(x.PaymentMethod, "Promotional", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Amount must be greater than 0 for non-promotional payments.");

        RuleFor(x => x.TransactionReference)
            .NotEmpty()
            .When(x => !string.Equals(x.PaymentMethod, "Cash", StringComparison.OrdinalIgnoreCase) &&
                       !string.Equals(x.PaymentMethod, "Promotional", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Transaction reference is required for non-cash/non-promotional payments.");

        RuleFor(x => x.TransactionReference)
            .MaximumLength(256).WithMessage("TransactionReference cannot exceed 256 characters.");

        RuleFor(x => x.Notes)
            .MaximumLength(2000).WithMessage("Notes cannot exceed 2000 characters.");

        RuleFor(x => x.PaymentDate)
            .LessThanOrEqualTo(_ => DateTime.UtcNow.AddDays(30))
            .When(x => x.PaymentDate.HasValue)
            .WithMessage("PaymentDate cannot be more than 30 days in the future.");
    }
}
