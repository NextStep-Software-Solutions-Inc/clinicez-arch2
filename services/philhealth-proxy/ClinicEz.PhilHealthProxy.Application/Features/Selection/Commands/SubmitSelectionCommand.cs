using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Selection.Commands;

public sealed record SubmitSelectionCommand(YakapSelectionRequest Request) : IRequest<YakapSelectionResponse>;

public sealed class SubmitSelectionCommandValidator : AbstractValidator<SubmitSelectionCommand>
{
    public SubmitSelectionCommandValidator()
    {
        RuleFor(x => x.Request.PatientPin).NotEmpty().WithMessage("Patient PIN is required.");
        RuleFor(x => x.Request.SelectionDate).NotEmpty().WithMessage("Selection date is required.");
        RuleFor(x => x.Request.Consent).Equal(true).WithMessage("Patient consent is required.");
    }
}

public sealed class SubmitSelectionCommandHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<SubmitSelectionCommand, YakapSelectionResponse>
{
    public async Task<YakapSelectionResponse> Handle(SubmitSelectionCommand command, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.SubmitSelectionAsync(command.Request, tenant, ct);
    }
}
