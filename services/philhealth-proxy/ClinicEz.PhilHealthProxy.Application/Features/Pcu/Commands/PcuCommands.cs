using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Pcu.Commands;

public sealed record StartPcuCommand(PcuStartRequest Request) : IRequest<PcuStartResponse>;

public sealed class StartPcuCommandValidator : AbstractValidator<StartPcuCommand>
{
    public StartPcuCommandValidator()
    {
        RuleFor(x => x.Request.Pin).NotEmpty().WithMessage("Patient PIN is required.");
        RuleFor(x => x.Request.FirstName).NotEmpty().WithMessage("First name is required.");
        RuleFor(x => x.Request.LastName).NotEmpty().WithMessage("Last name is required.");
        RuleFor(x => x.Request.BirthDate).NotEmpty().WithMessage("Birth date is required.");
    }
}

public sealed class StartPcuCommandHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<StartPcuCommand, PcuStartResponse>
{
    public async Task<PcuStartResponse> Handle(StartPcuCommand command, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.StartPcuAsync(command.Request, tenant, ct);
    }
}

public sealed record VerifyPcuCommand(PcuVerifyRequest Request) : IRequest<PcuVerifyResponse>;

public sealed class VerifyPcuCommandValidator : AbstractValidator<VerifyPcuCommand>
{
    public VerifyPcuCommandValidator()
    {
        RuleFor(x => x.Request.LivenessAuthorizationId).NotEmpty().WithMessage("Liveness authorization ID is required.");
    }
}

public sealed class VerifyPcuCommandHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<VerifyPcuCommand, PcuVerifyResponse>
{
    public async Task<PcuVerifyResponse> Handle(VerifyPcuCommand command, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.VerifyPcuAsync(command.Request, tenant, ct);
    }
}
