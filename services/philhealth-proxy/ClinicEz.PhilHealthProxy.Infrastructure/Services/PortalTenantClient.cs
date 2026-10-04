using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

public sealed class PortalTenantClient : ITenantRepository
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);
    private readonly HttpClient _httpClient;
    private readonly IMemoryCache _cache;
    private readonly IDataProtector _protector;
    private readonly ILogger<PortalTenantClient> _logger;

    public PortalTenantClient(
        HttpClient httpClient,
        IMemoryCache cache,
        IDataProtectionProvider dataProtectionProvider,
        ILogger<PortalTenantClient> logger)
    {
        _httpClient = httpClient;
        _cache = cache;
        _protector = dataProtectionProvider.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials");
        _logger = logger;
    }

    public async Task<PhilHealthTenant?> GetByTenantIdAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var cacheKey = $"philhealth_tenant_{tenantId}";
        if (_cache.TryGetValue(cacheKey, out PhilHealthTenant? cachedTenant) && cachedTenant is not null)
        {
            _logger.LogDebug("[PortalTenantClient] Cache hit for Tenant {TenantId}", tenantId);
            return cachedTenant;
        }

        _logger.LogInformation("[PortalTenantClient] Cache miss for Tenant {TenantId}. Fetching from Portal API...", tenantId);

        try
        {
            var response = await _httpClient.GetAsync($"/api/v1/internal/tenants/{tenantId}/philhealth-config", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("[PortalTenantClient] Failed to fetch PhilHealth config for Tenant {TenantId}. HTTP {StatusCode}",
                    tenantId, response.StatusCode);
                return null;
            }

            var dto = await response.Content.ReadFromJsonAsync<InternalPhilHealthConfigDto>(cancellationToken: cancellationToken);
            if (dto is null) return null;

            var tenant = MapToTenant(dto);

            _cache.Set(cacheKey, tenant, CacheDuration);
            if (dto.BranchId.HasValue)
            {
                _cache.Set($"philhealth_branch_{dto.BranchId.Value}", tenant, CacheDuration);
            }

            return tenant;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PortalTenantClient] Exception resolving PhilHealth config for Tenant {TenantId}", tenantId);
            return null;
        }
    }

    public async Task<PhilHealthTenant?> GetByBranchIdAsync(Guid branchId, CancellationToken cancellationToken = default)
    {
        var cacheKey = $"philhealth_branch_{branchId}";
        if (_cache.TryGetValue(cacheKey, out PhilHealthTenant? cachedTenant) && cachedTenant is not null)
        {
            _logger.LogDebug("[PortalTenantClient] Cache hit for Branch {BranchId}", branchId);
            return cachedTenant;
        }

        _logger.LogInformation("[PortalTenantClient] Cache miss for Branch {BranchId}. Fetching from Portal API...", branchId);

        try
        {
            var response = await _httpClient.GetAsync($"/api/v1/internal/branches/{branchId}/philhealth-config", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("[PortalTenantClient] Failed to fetch PhilHealth config for Branch {BranchId}. HTTP {StatusCode}",
                    branchId, response.StatusCode);
                return null;
            }

            var dto = await response.Content.ReadFromJsonAsync<InternalPhilHealthConfigDto>(cancellationToken: cancellationToken);
            if (dto is null) return null;

            var tenant = MapToTenant(dto);

            _cache.Set(cacheKey, tenant, CacheDuration);
            _cache.Set($"philhealth_tenant_{dto.TenantId}", tenant, CacheDuration);

            return tenant;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PortalTenantClient] Exception resolving PhilHealth config for Branch {BranchId}", branchId);
            return null;
        }
    }

    public async Task<PhilHealthTenant> UpsertTenantAsync(PhilHealthTenant tenant, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("[PortalTenantClient] Upserting PhilHealth config for Tenant {TenantId}...", tenant.TenantId);

        string username = string.Empty;
        if (!string.IsNullOrEmpty(tenant.EncryptedUsername))
        {
            try { username = _protector.Unprotect(tenant.EncryptedUsername); } catch { username = tenant.EncryptedUsername; }
        }

        string password = string.Empty;
        if (!string.IsNullOrEmpty(tenant.EncryptedPassword))
        {
            try { password = _protector.Unprotect(tenant.EncryptedPassword); } catch { password = tenant.EncryptedPassword; }
        }

        string cipherKey = string.Empty;
        if (!string.IsNullOrEmpty(tenant.EncryptedCipherKey))
        {
            try { cipherKey = _protector.Unprotect(tenant.EncryptedCipherKey); } catch { cipherKey = tenant.EncryptedCipherKey; }
        }

        var payload = new
        {
            AccreditationNumber = tenant.AccreditationNumber,
            PmccNumber = tenant.PmccNumber,
            SoftwareCertificateId = tenant.SoftwareCertificateId,
            Username = username,
            Password = password,
            CipherKey = cipherKey,
            KonsultaEndpoint = tenant.KonsultaEndpoint,
            IsPhilHealthAccredited = tenant.IsActive
        };

        try
        {
            var response = await _httpClient.PutAsJsonAsync(
                $"/api/v1/internal/tenants/{tenant.TenantId}/philhealth-config",
                payload,
                cancellationToken);

            response.EnsureSuccessStatusCode();

            // Update in-memory cache with 1-hour TTL
            _cache.Set($"philhealth_tenant_{tenant.TenantId}", tenant, CacheDuration);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PortalTenantClient] Error syncing PhilHealth credentials to Portal API for Tenant {TenantId}", tenant.TenantId);
        }

        return tenant;
    }

    private PhilHealthTenant MapToTenant(InternalPhilHealthConfigDto dto)
    {
        return new PhilHealthTenant
        {
            TenantId = dto.TenantId,
            FacilityName = dto.FacilityName,
            AccreditationNumber = dto.AccreditationNumber,
            PmccNumber = dto.PmccNumber,
            SoftwareCertificateId = dto.SoftwareCertificateId,
            EncryptedUsername = !string.IsNullOrEmpty(dto.Username) ? _protector.Protect(dto.Username) : string.Empty,
            EncryptedPassword = !string.IsNullOrEmpty(dto.Password) ? _protector.Protect(dto.Password) : string.Empty,
            EncryptedCipherKey = !string.IsNullOrEmpty(dto.CipherKey) ? _protector.Protect(dto.CipherKey) : string.Empty,
            KonsultaEndpoint = !string.IsNullOrWhiteSpace(dto.KonsultaEndpoint) ? dto.KonsultaEndpoint : "https://staging.philhealth.gov.ph/KONSULTA/SOAP",
            IsActive = dto.IsActive,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    private sealed record InternalPhilHealthConfigDto(
        [property: JsonPropertyName("tenantId")] Guid TenantId,
        [property: JsonPropertyName("branchId")] Guid? BranchId,
        [property: JsonPropertyName("facilityName")] string FacilityName,
        [property: JsonPropertyName("accreditationNumber")] string AccreditationNumber,
        [property: JsonPropertyName("pmccNumber")] string PmccNumber,
        [property: JsonPropertyName("softwareCertificateId")] string SoftwareCertificateId,
        [property: JsonPropertyName("username")] string Username,
        [property: JsonPropertyName("password")] string Password,
        [property: JsonPropertyName("cipherKey")] string CipherKey,
        [property: JsonPropertyName("konsultaEndpoint")] string KonsultaEndpoint,
        [property: JsonPropertyName("isActive")] bool IsActive);
}
