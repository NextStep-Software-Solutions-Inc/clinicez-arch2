using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.DataProtection;

namespace ClinicEz.PhilHealthProxy.Application.Features.DataUpload.Commands;

/// <summary>
/// Encrypts plain PCAPI v2.0 Annex A JSON at the proxy security boundary (Annex C AES-256-CBC)
/// using the tenant/branch cipher key and uploads it to Service 06.
/// </summary>
public sealed record UploadPlainJsonDataCommand(string Form, string PlainJson) : IRequest<DataUploadResponse>;

public sealed class UploadPlainJsonDataCommandValidator : AbstractValidator<UploadPlainJsonDataCommand>
{
    public UploadPlainJsonDataCommandValidator()
    {
        RuleFor(x => x.Form).NotEmpty().WithMessage("Upload form is required.");
        RuleFor(x => x.PlainJson).NotEmpty().WithMessage("Payload JSON is required.");
    }
}

public sealed class UploadPlainJsonDataCommandHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient,
    IPhilHealthPayloadEncryptor encryptor,
    IDataProtectionProvider dataProtectionProvider)
    : IRequestHandler<UploadPlainJsonDataCommand, DataUploadResponse>
{
    public async Task<DataUploadResponse> Handle(UploadPlainJsonDataCommand command, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        var cipherKey = TenantResolutionHelper.ResolveCipherKey(tenant, dataProtectionProvider);
        var envelope = encryptor.EncryptJson(command.PlainJson, cipherKey);
        return await pcapiClient.UploadDataAsync(command.Form, envelope, tenant, ct);
    }
}
