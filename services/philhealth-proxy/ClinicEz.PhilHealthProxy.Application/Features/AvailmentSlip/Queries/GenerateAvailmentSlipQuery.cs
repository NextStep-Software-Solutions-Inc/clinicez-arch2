using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.AvailmentSlip.Queries;

public sealed record GenerateAvailmentSlipQuery(AvailmentSlipRequest Request) : IRequest<PhilHealthEncryptedPayload>;

public sealed class GenerateAvailmentSlipQueryValidator : AbstractValidator<GenerateAvailmentSlipQuery>
{
    public GenerateAvailmentSlipQueryValidator()
    {
        RuleFor(x => x.Request.PatientPin).NotEmpty().WithMessage("Patient PIN is required.");
        RuleFor(x => x.Request.EffYear).NotEmpty().WithMessage("Effective year is required.");
    }
}

public sealed class GenerateAvailmentSlipQueryHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<GenerateAvailmentSlipQuery, PhilHealthEncryptedPayload>
{
    public async Task<PhilHealthEncryptedPayload> Handle(GenerateAvailmentSlipQuery query, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.GenerateAvailmentSlipAsync(query.Request, tenant, ct);
    }
}
