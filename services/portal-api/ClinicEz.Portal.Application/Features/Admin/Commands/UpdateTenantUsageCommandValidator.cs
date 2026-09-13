using FluentValidation;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public class UpdateTenantUsageCommandValidator : AbstractValidator<UpdateTenantUsageCommand>
{
    public UpdateTenantUsageCommandValidator()
    {
        RuleFor(v => v.Id)
            .NotEmpty().WithMessage("Tenant ID is required.");

        RuleFor(v => v.ClinicalBranchesCount)
            .GreaterThanOrEqualTo(1).WithMessage("Clinical branches count must be at least 1.");

        RuleFor(v => v.StaffAccountsCount)
            .GreaterThanOrEqualTo(0).WithMessage("Staff accounts count cannot be negative.");

        RuleFor(v => v.ActivePatientRecordsCount)
            .GreaterThanOrEqualTo(0).WithMessage("Active patient records count cannot be negative.");

        RuleFor(v => v.MonthlyApiQuotaUsed)
            .GreaterThanOrEqualTo(0).WithMessage("Monthly API quota used cannot be negative.");

        RuleFor(v => v.MonthlyApiQuotaLimit)
            .GreaterThan(0).WithMessage("Monthly API quota limit must be greater than 0.");
    }
}
