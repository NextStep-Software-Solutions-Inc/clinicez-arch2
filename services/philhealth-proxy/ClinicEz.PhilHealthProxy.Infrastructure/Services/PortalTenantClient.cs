using System.Net.Http.Json;
using System.Text.Json.Serialization;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

public sealed class PortalTenantClient : ITenantRepository
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);
    private readonly IInteropRequestClient? _requests;
    private readonly HttpClient? _httpClient;
    private readonly IMemoryCache _cache;
    private readonly IDataProtector _protector;
    private readonly ILogger<PortalTenantClient> _logger;

    public PortalTenantClient(
        HttpClient httpClient,
        IMemoryCache cache,
        IDataProtectionProvider dataProtectionProvider,
        ILogger<PortalTenantClient> logger)
        : this(cache, dataProtectionProvider, logger, null, httpClient)
    {
    }

    public PortalTenantClient(
        IInteropRequestClient requests,
        IMemoryCache cache,
        IDataProtectionProvider dataProtectionProvider,
        ILogger<PortalTenantClient> logger)
        : this(cache, dataProtectionProvider, logger, requests, null)
    {
    }

    public PortalTenantClient(
        IMemoryCache cache,
        IDataProtectionProvider dataProtectionProvider,
        ILogger<PortalTenantClient> logger,
        IInteropRequestClient? requests = null,
        HttpClient? httpClient = null)
    {
        _cache = cache;
        _protector = dataProtectionProvider.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials");
        _logger = logger;
        _requests = requests;
        _httpClient = httpClient;
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

        if (_requests is not null)
        {
            try
            {
                var reply = await _requests.RequestAsync<PhilHealthConfigRequestedPayload, PhilHealthConfigRespondedPayload>(
                    InteropTypes.PhilHealthConfigRequested,
                    InteropTypes.PhilHealthConfigResponded,
                    Party.PhilHealth,
                    Party.Portal,
                    new PhilHealthConfigRequestedPayload { TenantId = tenantId.ToString() },
                    ct: cancellationToken);

                if (!reply.Found || reply.Config is null) return null;

                var tenant = MapToTenant(reply.Config);
                _cache.Set(cacheKey, tenant, CacheDuration);
                if (!string.IsNullOrEmpty(reply.Config.BranchId) && Guid.TryParse(reply.Config.BranchId, out var branchGuid))
                {
                    _cache.Set($"philhealth_branch_{branchGuid}", tenant, CacheDuration);
                }

                return tenant;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PortalTenantClient] Exception resolving PhilHealth config for Tenant {TenantId} over interop hub", tenantId);
                return null;
            }
        }

        if (_httpClient is not null)
        {
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

        return null;
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

        if (_requests is not null)
        {
            try
            {
                var reply = await _requests.RequestAsync<PhilHealthConfigRequestedPayload, PhilHealthConfigRespondedPayload>(
                    InteropTypes.PhilHealthConfigRequested,
                    InteropTypes.PhilHealthConfigResponded,
                    Party.PhilHealth,
                    Party.Portal,
                    new PhilHealthConfigRequestedPayload { BranchId = branchId.ToString() },
                    ct: cancellationToken);

                if (!reply.Found || reply.Config is null) return null;

                var tenant = MapToTenant(reply.Config);
                _cache.Set(cacheKey, tenant, CacheDuration);
                if (Guid.TryParse(reply.Config.TenantId, out var tenantGuid))
                {
                    _cache.Set($"philhealth_tenant_{tenantGuid}", tenant, CacheDuration);
                }

                return tenant;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PortalTenantClient] Exception resolving PhilHealth config for Branch {BranchId} over interop hub", branchId);
                return null;
            }
        }

        if (_httpClient is not null)
        {
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

        return null;
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

        if (_requests is not null)
        {
            try
            {
                var payload = new PhilHealthConfigPayload
                {
                    TenantId = tenant.TenantId.ToString(),
                    AccreditationNumber = tenant.AccreditationNumber,
                    PmccNumber = tenant.PmccNumber,
                    SoftwareCertificateId = tenant.SoftwareCertificateId,
                    Username = username,
                    Password = password,
                    CipherKey = cipherKey,
                    KonsultaEndpoint = tenant.KonsultaEndpoint,
                    IsActive = tenant.IsActive
                };

                var reply = await _requests.RequestAsync<PhilHealthConfigPayload, PhilHealthConfigUpsertRespondedPayload>(
                    InteropTypes.PhilHealthConfigUpsertRequested,
                    InteropTypes.PhilHealthConfigUpsertResponded,
                    Party.PhilHealth,
                    Party.Portal,
                    payload,
                    ct: cancellationToken);

                if (reply.Succeeded)
                {
                    _cache.Set($"philhealth_tenant_{tenant.TenantId}", tenant, CacheDuration);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PortalTenantClient] Error syncing PhilHealth credentials to Portal API over hub for Tenant {TenantId}", tenant.TenantId);
            }

            return tenant;
        }

        if (_httpClient is not null)
        {
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
        }

        return tenant;
    }

    private PhilHealthTenant MapToTenant(PhilHealthConfigPayload dto)
    {
        return new PhilHealthTenant
        {
            TenantId = Guid.TryParse(dto.TenantId, out var tid) ? tid : Guid.Empty,
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
