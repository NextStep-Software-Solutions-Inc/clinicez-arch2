using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

public record ConfigureTenantCredentialsRequest(
    Guid TenantId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string Username,
    string Password,
    string CipherKey,
    string? KonsultaEndpoint = null);

public record TenantConfigurationStatusResponse(
    Guid TenantId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string KonsultaEndpoint,
    bool IsConfigured,
    bool IsActive,
    DateTimeOffset? UpdatedAt);

[ApiController]
[Route("api/[controller]")]
public sealed class TenantsController : ControllerBase
{
    private readonly ITenantRepository _tenantRepository;
    private readonly IPhilHealthSoapClient _soapClient;
    private readonly IDataProtector _protector;
    private readonly ILogger<TenantsController> _logger;

    public TenantsController(
        ITenantRepository tenantRepository,
        IPhilHealthSoapClient soapClient,
        IDataProtectionProvider dataProtectionProvider,
        ILogger<TenantsController> logger)
    {
        _tenantRepository = tenantRepository;
        _soapClient = soapClient;
        _protector = dataProtectionProvider.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials");
        _logger = logger;
    }

    /// <summary>
    /// Securely configures or updates the PhilHealth SOAP credentials for a tenant.
    /// Sensitive credentials (username, password, cipher key) are encrypted at rest using ASP.NET Core Data Protection.
    /// </summary>
    [HttpPost("configure")]
    [ProducesResponseType<ApiResponse<TenantConfigurationStatusResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ConfigureCredentials(
        [FromBody] ConfigureTenantCredentialsRequest request,
        CancellationToken ct)
    {
        if (request.TenantId == Guid.Empty)
        {
            return BadRequest(ApiResponse<TenantConfigurationStatusResponse>.Fail("Invalid TenantId."));
        }

        if (string.IsNullOrWhiteSpace(request.AccreditationNumber) ||
            string.IsNullOrWhiteSpace(request.Username) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(ApiResponse<TenantConfigurationStatusResponse>.Fail("Accreditation number, username, and password are required."));
        }

        var cipherKey = !string.IsNullOrWhiteSpace(request.CipherKey)
            ? request.CipherKey
            : "CLINICEZ-YAKAP-DEV-KEY-32BYTES!";

        var endpoint = !string.IsNullOrWhiteSpace(request.KonsultaEndpoint)
            ? request.KonsultaEndpoint
            : "/soap/konsulta";

        var tenant = new PhilHealthTenant
        {
            TenantId = request.TenantId,
            FacilityName = request.FacilityName ?? "Accredited Health Facility",
            AccreditationNumber = request.AccreditationNumber.Trim(),
            PmccNumber = request.PmccNumber ?? string.Empty,
            SoftwareCertificateId = request.SoftwareCertificateId ?? string.Empty,
            EncryptedUsername = _protector.Protect(request.Username.Trim()),
            EncryptedPassword = _protector.Protect(request.Password),
            EncryptedCipherKey = _protector.Protect(cipherKey),
            KonsultaEndpoint = endpoint,
            IsActive = true
        };

        var saved = await _tenantRepository.UpsertTenantAsync(tenant, ct);
        _logger.LogInformation("Configured PhilHealth credentials for tenant {TenantId} (Accreditation: {Accre})", saved.TenantId, saved.AccreditationNumber);

        var response = new TenantConfigurationStatusResponse(
            TenantId: saved.TenantId,
            FacilityName: saved.FacilityName,
            AccreditationNumber: saved.AccreditationNumber,
            PmccNumber: saved.PmccNumber,
            SoftwareCertificateId: saved.SoftwareCertificateId,
            KonsultaEndpoint: saved.KonsultaEndpoint,
            IsConfigured: true,
            IsActive: saved.IsActive,
            UpdatedAt: saved.UpdatedAt);

        return Ok(ApiResponse<TenantConfigurationStatusResponse>.Success(response));
    }

    /// <summary>
    /// Retrieves configuration metadata for the specified or current tenant without exposing sensitive secrets.
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType<ApiResponse<TenantConfigurationStatusResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetStatus(
        [FromQuery] Guid? tenantId,
        [FromServices] ICurrentTenant currentTenant,
        CancellationToken ct)
    {
        var targetTenantId = tenantId ?? currentTenant.TenantId;
        if (!targetTenantId.HasValue || targetTenantId.Value == Guid.Empty)
        {
            return Ok(ApiResponse<TenantConfigurationStatusResponse>.Success(
                new TenantConfigurationStatusResponse(
                    TenantId: Guid.Empty,
                    FacilityName: string.Empty,
                    AccreditationNumber: string.Empty,
                    PmccNumber: string.Empty,
                    SoftwareCertificateId: string.Empty,
                    KonsultaEndpoint: "/soap/konsulta",
                    IsConfigured: false,
                    IsActive: false,
                    UpdatedAt: null)));
        }

        var tenant = await _tenantRepository.GetByTenantIdAsync(targetTenantId.Value, ct);
        if (tenant == null)
        {
            return Ok(ApiResponse<TenantConfigurationStatusResponse>.Success(
                new TenantConfigurationStatusResponse(
                    TenantId: targetTenantId.Value,
                    FacilityName: string.Empty,
                    AccreditationNumber: string.Empty,
                    PmccNumber: string.Empty,
                    SoftwareCertificateId: string.Empty,
                    KonsultaEndpoint: "/soap/konsulta",
                    IsConfigured: false,
                    IsActive: false,
                    UpdatedAt: null)));
        }

        var response = new TenantConfigurationStatusResponse(
            TenantId: tenant.TenantId,
            FacilityName: tenant.FacilityName,
            AccreditationNumber: tenant.AccreditationNumber,
            PmccNumber: tenant.PmccNumber,
            SoftwareCertificateId: tenant.SoftwareCertificateId,
            KonsultaEndpoint: tenant.KonsultaEndpoint,
            IsConfigured: true,
            IsActive: tenant.IsActive,
            UpdatedAt: tenant.UpdatedAt);

        return Ok(ApiResponse<TenantConfigurationStatusResponse>.Success(response));
    }

    /// <summary>
    /// Tests live connectivity and authentication with PhilHealth SOAP gateway using the tenant's credentials.
    /// </summary>
    [HttpPost("test-connection")]
    [ProducesResponseType<ApiResponse<string>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> TestConnection(
        [FromQuery] Guid? tenantId,
        [FromServices] CurrentTenantService tenantService,
        CancellationToken ct)
    {
        if (tenantId.HasValue && tenantId.Value != Guid.Empty)
        {
            tenantService.SetTenantId(tenantId.Value);
        }

        var result = await _soapClient.GetTokenAsync(ct);
        if (result.IsSuccess)
        {
            return Ok(ApiResponse<string>.Success("Authentication successful! PhilHealth gateway accepted facility credentials."));
        }

        return Ok(ApiResponse<string>.Fail(result.ErrorMessage ?? "PhilHealth gateway rejected credentials."));
    }
}

