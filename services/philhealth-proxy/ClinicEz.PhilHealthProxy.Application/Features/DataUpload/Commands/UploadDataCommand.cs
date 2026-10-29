using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.DataUpload.Commands;

public sealed record UploadDataCommand(string Form, PhilHealthEncryptedPayload Envelope) : IRequest<DataUploadResponse>;

public sealed class UploadDataCommandValidator : AbstractValidator<UploadDataCommand>
{
    public UploadDataCommandValidator()
    {
        RuleFor(x => x.Form).NotEmpty().WithMessage("Upload form is required.");
        RuleFor(x => x.Envelope).NotNull().WithMessage("Encrypted payload envelope is required.");
        RuleFor(x => x.Envelope.Doc).NotEmpty().WithMessage("Ciphertext doc is required.");
    }
}

public sealed class UploadDataCommandHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<UploadDataCommand, DataUploadResponse>
{
    public async Task<DataUploadResponse> Handle(UploadDataCommand command, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.UploadDataAsync(command.Form, command.Envelope, tenant, ct);
    }
}
