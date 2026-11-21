using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.DataProtection;

namespace ClinicEz.PhilHealthProxy.Application.Features.AvailmentSlip.Queries;

/// <summary>
/// Calls Service 08 to obtain the Annex C encrypted PDF slip and decrypts it at the proxy boundary,
/// returning a ready-to-print base64 PDF DTO without leaking the facility cipher key.
/// </summary>
public sealed record GenerateDecryptedAvailmentSlipQuery(AvailmentSlipRequest Request) : IRequest<AvailmentSlipResponse>;

public sealed class GenerateDecryptedAvailmentSlipQueryValidator : AbstractValidator<GenerateDecryptedAvailmentSlipQuery>
{
    public GenerateDecryptedAvailmentSlipQueryValidator()
    {
        RuleFor(x => x.Request.PatientPin).NotEmpty().WithMessage("Patient PIN is required.");
        RuleFor(x => x.Request.EffYear).NotEmpty().WithMessage("Effective year is required.");
    }
}

public sealed class GenerateDecryptedAvailmentSlipQueryHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient,
    IPhilHealthPayloadEncryptor encryptor,
    IDataProtectionProvider dataProtectionProvider)
    : IRequestHandler<GenerateDecryptedAvailmentSlipQuery, AvailmentSlipResponse>
{
    public async Task<AvailmentSlipResponse> Handle(GenerateDecryptedAvailmentSlipQuery query, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        var cipherKey = TenantResolutionHelper.ResolveCipherKey(tenant, dataProtectionProvider);
        var envelope = await pcapiClient.GenerateAvailmentSlipAsync(query.Request, tenant, ct);
        var pdfBytes = encryptor.DecryptPdf(envelope, cipherKey);

        return new AvailmentSlipResponse(
            query.Request.PatientPin,
            query.Request.EffYear,
            "application/pdf",
            Convert.ToBase64String(pdfBytes));
    }
}
