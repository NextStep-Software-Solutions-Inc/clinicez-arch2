using FluentValidation;

namespace CLINICEZ.PhilHealth.Proxy.Features.Members.Queries.GetMemberInfo;

public sealed class GetMemberInfoQueryValidator : AbstractValidator<GetMemberInfoQuery>
{
    public GetMemberInfoQueryValidator()
    {
        RuleFor(x => x.PhilHealthNumber)
            .NotEmpty()
                .WithMessage("PhilHealth Identification Number is required.")
            .Length(12)
                .WithMessage("PhilHealth Identification Number must be exactly 12 characters.")
            .Matches(@"^\d{2}-\d{9}-\d$")
                .WithMessage("PhilHealth Identification Number must follow the format: XX-XXXXXXXXX-X (e.g., 01-234567890-1).");
    }
}
