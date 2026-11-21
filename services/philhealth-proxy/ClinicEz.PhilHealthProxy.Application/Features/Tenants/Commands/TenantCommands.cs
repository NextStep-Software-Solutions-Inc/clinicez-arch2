using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.DataProtection;

namespace ClinicEz.PhilHealthProxy.Application.Features.Tenants.Commands;

public sealed record ConfigureTenantCredentialsCommand(ConfigureTenantCredentialsRequest Request) : IRequest<TenantConfigurationStatusResponse>;

public sealed class ConfigureTenantCredentialsCommandValidator : AbstractValidator<ConfigureTenantCredentialsCommand>
{
    public ConfigureTenantCredentialsCommandValidator()
    {
        RuleFor(x => x.Request.TenantId).NotEmpty().WithMessage("TenantId is required.");
        RuleFor(x => x.Request.AccreditationNumber).NotEmpty().Length(9).WithMessage("Accreditation number must be exactly 9 characters.");
        RuleFor(x => x.Request.SecretKey).NotEmpty().WithMessage("Secret key is required.");
        RuleFor(x => x.Request.CipherKey).NotEmpty().WithMessage("Cipher key is required.");
    }
}

public sealed class ConfigureTenantCredentialsCommandHandler(
    ITenantRepository tenantRepo,
    IDataProtectionProvider dataProtectionProvider)
    : IRequestHandler<ConfigureTenantCredentialsCommand, TenantConfigurationStatusResponse>
{
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector("PhilHealthTenantProtection");

    public async Task<TenantConfigurationStatusResponse> Handle(ConfigureTenantCredentialsCommand command, CancellationToken ct)
    {
        var req = command.Request;
        var tenant = new PhilHealthTenant
        {
            TenantId = req.TenantId,
            BranchId = req.BranchId,
            FacilityName = req.FacilityName,
            AccreditationNumber = req.AccreditationNumber,
            PmccNumber = req.PmccNumber,
            SoftwareCertificateId = req.SoftwareCertificateId,
            EncryptedSecretKey = _protector.Protect(req.SecretKey),
            EncryptedCipherKey = _protector.Protect(req.CipherKey),
            BaseUrl = !string.IsNullOrWhiteSpace(req.BaseUrl) ? req.BaseUrl : "https://staging.philhealth.gov.ph",
            IsActive = req.IsActive,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        var saved = await tenantRepo.UpsertTenantAsync(tenant, ct);
        return new TenantConfigurationStatusResponse(
            saved.TenantId,
            saved.BranchId,
            saved.FacilityName,
            saved.AccreditationNumber,
            saved.PmccNumber,
            saved.SoftwareCertificateId,
            HasSecretKey: !string.IsNullOrEmpty(saved.EncryptedSecretKey),
            HasCipherKey: !string.IsNullOrEmpty(saved.EncryptedCipherKey),
            saved.BaseUrl,
            saved.IsActive,
            saved.UpdatedAt);
    }
}

public sealed record TestTenantConnectionCommand(Guid TenantId, Guid? BranchId = null) : IRequest<TestTenantConnectionResponse>;

public sealed class TestTenantConnectionCommandHandler(
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<TestTenantConnectionCommand, TestTenantConnectionResponse>
{
    public async Task<TestTenantConnectionResponse> Handle(TestTenantConnectionCommand command, CancellationToken ct)
    {
        var tenant = command.BranchId.HasValue
            ? await tenantRepo.GetByBranchIdAsync(command.BranchId.Value, ct)
            : await tenantRepo.GetByTenantIdAsync(command.TenantId, ct);

        if (tenant == null)
        {
            return new TestTenantConnectionResponse(false, "Tenant credentials not configured.", 404, 0);
        }

        var sw = Stopwatch.StartNew();
        try
        {
            var token = await pcapiClient.AuthenticateAsync(tenant, ct);
            sw.Stop();
            return new TestTenantConnectionResponse(true, "Successfully authenticated with PCAPI.", 200, sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new TestTenantConnectionResponse(false, $"Connection test failed: {ex.Message}", 502, sw.ElapsedMilliseconds);
        }
    }
}
