using FluentValidation;

namespace PhilHealthProxy.Application.Features.Registration.Queries.ExtractRegistrationList;

public sealed class ExtractRegistrationListQueryValidator
    : AbstractValidator<ExtractRegistrationListQuery>
{
    private const string DateFormat = "yyyy-MM-dd";

    public ExtractRegistrationListQueryValidator()
    {
        RuleFor(x => x.StartDate)
            .NotEmpty()
                .WithMessage("Start date is required.")
            .Matches(@"^\d{4}-\d{2}-\d{2}$")
                .WithMessage($"Start date must be in {DateFormat} format.");

        RuleFor(x => x.EndDate)
            .NotEmpty()
                .WithMessage("End date is required.")
            .Matches(@"^\d{4}-\d{2}-\d{2}$")
                .WithMessage($"End date must be in {DateFormat} format.");

        RuleFor(x => x)
            .Must(q => IsEndDateAfterOrEqualStartDate(q.StartDate, q.EndDate))
                .WithName("DateRange")
                .WithMessage("End date must be on or after start date.")
            .When(q => !string.IsNullOrEmpty(q.StartDate) && !string.IsNullOrEmpty(q.EndDate));
    }

    private static bool IsEndDateAfterOrEqualStartDate(string startDate, string endDate)
    {
        if (!DateOnly.TryParseExact(startDate, DateFormat, out var start) ||
            !DateOnly.TryParseExact(endDate, DateFormat, out var end))
            return true;

        return end >= start;
    }
}
