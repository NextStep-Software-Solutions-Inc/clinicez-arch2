using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Empanelment.Commands;

public sealed record SubmitEmpanelmentCommand(YakapEmpanelmentRequest Request) : IRequest<YakapEmpanelmentResponse>;

public sealed class SubmitEmpanelmentCommandValidator : AbstractValidator<SubmitEmpanelmentCommand>
{
    public SubmitEmpanelmentCommandValidator()
    {
        RuleFor(x => x.Request.PatientPin).NotEmpty().WithMessage("Patient PIN is required.");
        RuleFor(x => x.Request.Consent).Equal(true).WithMessage("Patient consent is required.");
    }
}

public sealed class SubmitEmpanelmentCommandHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<SubmitEmpanelmentCommand, YakapEmpanelmentResponse>
{
    public async Task<YakapEmpanelmentResponse> Handle(SubmitEmpanelmentCommand command, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.SubmitEmpanelmentAsync(command.Request, tenant, ct);
    }
}
