using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/yakap/credentials")]
public sealed class YakapCredentialsController : ControllerBase
{
    private readonly IPhilHealthProxyClient _proxyClient;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<YakapCredentialsController> _logger;

    public YakapCredentialsController(
        IPhilHealthProxyClient proxyClient,
        IClinicContext clinicContext,
        IRepository<ClinicSettings> settingsRepo,
        IUnitOfWork unitOfWork,
        ILogger<YakapCredentialsController> logger)
    {
        _proxyClient = proxyClient;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    /// <summary>
    /// Securely saves PhilHealth credentials for the current facility.
    /// Secrets (password, cipher key) are encrypted at rest via the PhilHealth proxy.
    /// Non-secret metadata (accreditation, PMCC, software cert ID) is synchronized with local ClinicSettings.
    /// </summary>
    [HttpPost("configure")]
    [HasPermission(ClinicPermissions.YakapWrite)]
    public async Task<ActionResult<ApiResponse<PhilHealthConfigStatusResponse>>> Configure(
        [FromBody] ConfigureClinicPhilHealthCredentialsRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.AccreditationNumber) ||
            string.IsNullOrWhiteSpace(request.Username) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(ApiResponse<PhilHealthConfigStatusResponse>.Fail(
                "Accreditation number, username, and password are required."));
        }

        var tenantGuid = GetTenantGuid();

        // 1. Sync metadata to ClinicSettings
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            settings = new ClinicSettings
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                ClinicName = string.IsNullOrWhiteSpace(request.FacilityName) ? "Accredited Health Facility" : request.FacilityName.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "ClinicAdmin"
            };
            await _settingsRepo.AddAsync(settings, ct);
        }

        settings.AccreditationNumber = request.AccreditationNumber.Trim();
        settings.PmccNumber = request.PmccNumber?.Trim();
        settings.SoftwareCertificateId = request.SoftwareCertificateId?.Trim();
        settings.KonsultaEndpoint = string.IsNullOrWhiteSpace(request.KonsultaEndpoint) ? "/soap/konsulta" : request.KonsultaEndpoint.Trim();
        settings.IsPhilHealthConfigured = true;
        settings.UpdatedAt = DateTime.UtcNow;
        settings.UpdatedBy = "ClinicAdmin";

        await _unitOfWork.SaveChangesAsync(ct);

        // 2. Delegate encrypted storage of secrets to PhilHealth Proxy
        var proxyRequest = new ConfigurePhilHealthCredentialsProxyRequest(
            TenantId: tenantGuid,
            FacilityName: !string.IsNullOrWhiteSpace(request.FacilityName) ? request.FacilityName.Trim() : settings.ClinicName,
            AccreditationNumber: request.AccreditationNumber.Trim(),
            PmccNumber: request.PmccNumber?.Trim() ?? string.Empty,
            SoftwareCertificateId: request.SoftwareCertificateId?.Trim() ?? string.Empty,
            Username: request.Username.Trim(),
            Password: request.Password,
            CipherKey: !string.IsNullOrWhiteSpace(request.CipherKey) ? request.CipherKey.Trim() : "CLINICEZ-YAKAP-DEV-KEY-32BYTES!",
            KonsultaEndpoint: settings.KonsultaEndpoint);

        var proxyResponse = await _proxyClient.ConfigureTenantCredentialsAsync(proxyRequest, ct);
        if (!proxyResponse.Succeeded)
        {
            return BadRequest(proxyResponse);
        }

        _logger.LogInformation("Successfully configured PhilHealth credentials for facility {ClinicId} (Tenant: {TenantGuid})", _clinicContext.ClinicId, tenantGuid);
        return Ok(proxyResponse);
    }

    /// <summary>
    /// Retrieves current PhilHealth configuration status without leaking sensitive secrets.
    /// </summary>
    [HttpGet("status")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<PhilHealthConfigStatusResponse>>> GetStatus(CancellationToken ct)
    {
        var tenantGuid = GetTenantGuid();
        var proxyStatus = await _proxyClient.GetTenantConfigurationStatusAsync(tenantGuid, ct);

        if (proxyStatus.Succeeded && proxyStatus.Data != null && proxyStatus.Data.IsConfigured)
        {
            return Ok(proxyStatus);
        }

        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        var fallback = new PhilHealthConfigStatusResponse(
            TenantId: tenantGuid,
            FacilityName: settings?.ClinicName ?? "Accredited Health Facility",
            AccreditationNumber: settings?.AccreditationNumber ?? string.Empty,
            PmccNumber: settings?.PmccNumber ?? string.Empty,
            SoftwareCertificateId: settings?.SoftwareCertificateId ?? string.Empty,
            KonsultaEndpoint: settings?.KonsultaEndpoint ?? "/soap/konsulta",
            IsConfigured: settings?.IsPhilHealthConfigured ?? false,
            IsActive: settings?.IsPhilHealthConfigured ?? false,
            UpdatedAt: settings?.UpdatedAt);

        return Ok(ApiResponse<PhilHealthConfigStatusResponse>.Success(fallback));
    }

    /// <summary>
    /// Tests live connectivity and authentication with PhilHealth SOAP gateway using the facility credentials.
    /// </summary>
    [HttpPost("test-connection")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<string>>> TestConnection(CancellationToken ct)
    {
        var tenantGuid = GetTenantGuid();
        var result = await _proxyClient.TestTenantConnectionAsync(tenantGuid, ct);
        if (!result.Succeeded)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    private Guid GetTenantGuid()
    {
        if (Guid.TryParse(_clinicContext.TenantId, out var parsed) && parsed != Guid.Empty)
        {
            return parsed;
        }

        using var md5 = MD5.Create();
        var hash = md5.ComputeHash(Encoding.UTF8.GetBytes(_clinicContext.TenantId ?? "tenant_default"));
        return new Guid(hash);
    }
}
