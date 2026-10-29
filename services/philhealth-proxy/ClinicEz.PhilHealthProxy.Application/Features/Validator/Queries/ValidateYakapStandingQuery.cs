using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Validator.Queries;

public sealed record ValidateYakapStandingQuery(YakapValidateStandingRequest Request) : IRequest<YakapValidatorResponse>;

public sealed class ValidateYakapStandingQueryValidator : AbstractValidator<ValidateYakapStandingQuery>
{
    public ValidateYakapStandingQueryValidator()
    {
        RuleFor(x => x.Request.PatientPin).NotEmpty().WithMessage("Patient PIN is required.");
        RuleFor(x => x.Request.EffYear).NotEmpty().WithMessage("Effective year is required.");
    }
}

public sealed class ValidateYakapStandingQueryHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<ValidateYakapStandingQuery, YakapValidatorResponse>
{
    public async Task<YakapValidatorResponse> Handle(ValidateYakapStandingQuery query, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.ValidateStandingAsync(query.Request, tenant, ct);
    }
}
