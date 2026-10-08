using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public class TenantLookupService : ITenantLookupService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TenantLookupService> _logger;

    public TenantLookupService(
        ApplicationDbContext dbContext,
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<TenantLookupService> logger)
    {
        _dbContext = dbContext;
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    private string ResolvePortalBaseUrl()
    {
        var portalBase = _configuration["Services:PortalApiUrl"] ??
                         _configuration["PortalSettings:PortalApiUrl"] ??
                         Environment.GetEnvironmentVariable("PORTAL_API_URL") ??
                         Environment.GetEnvironmentVariable("SERVICES_PORTAL_API_URL") ??
                         "http://portal-api:8080";

        portalBase = portalBase.TrimEnd('/');
        if (portalBase.EndsWith("/api/v1", StringComparison.OrdinalIgnoreCase))
        {
            portalBase = portalBase[..^7].TrimEnd('/');
        }
        return portalBase;
    }

    public async Task<TenantLookupDto?> LookupFacilityAsync(string facilityIdentifier, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(facilityIdentifier)) return null;
        var clean = facilityIdentifier.Trim().ToLowerInvariant();
        var isGuid = Guid.TryParse(facilityIdentifier, out var guid);

        // 1. Direct PostgreSQL query against main."Facilities" table
        try
        {
            var facQuery = _dbContext.Facilities.AsNoTracking().Where(f => !f.IsDeleted);
            var dbFacility = isGuid
                ? await facQuery.FirstOrDefaultAsync(f => f.Id == guid, ct)
                : await facQuery.FirstOrDefaultAsync(f => f.Slug.ToLower() == clean, ct);

            if (dbFacility != null)
            {
                var parentTenant = await _dbContext.Tenants.AsNoTracking()
                    .FirstOrDefaultAsync(t => t.Id == dbFacility.TenantId && !t.IsDeleted, ct);
                if (parentTenant != null)
                {
                    return new TenantLookupDto(parentTenant.Id, parentTenant.TenantSlug, dbFacility.Name, dbFacility.Id, dbFacility.Slug);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TenantLookup] Direct database query for facility '{Identifier}' failed.", facilityIdentifier);
        }

        // 2. HTTP Fallback to Portal API
        try
        {
            var portalBase = ResolvePortalBaseUrl();
            var lookupSlug = isGuid ? facilityIdentifier : clean;
            var response = await _httpClient.GetAsync($"{portalBase}/api/v1/tenants/lookup/{Uri.EscapeDataString(lookupSlug)}", ct);

            if (response.IsSuccessStatusCode)
            {
                var payload = await response.Content.ReadFromJsonAsync<PortalTenantLookupResponse>(cancellationToken: ct);
                if (payload != null && payload.Exists && Guid.TryParse(payload.TenantId, out var parsedGuid))
                {
                    Guid? parsedFacilityId = Guid.TryParse(payload.FacilityId, out var fId) ? fId : null;
                    if (parsedFacilityId.HasValue || !string.IsNullOrWhiteSpace(payload.FacilitySlug))
                    {
                        return new TenantLookupDto(
                            parsedGuid,
                            payload.TenantSlug ?? clean,
                            payload.Name ?? clean,
                            parsedFacilityId,
                            payload.FacilitySlug ?? clean);
                    }
                }
            }
        }
        catch (Exception httpEx)
        {
            _logger.LogWarning(httpEx, "[TenantLookup] Portal API HTTP lookup for facility '{Identifier}' failed.", facilityIdentifier);
        }

        return null;
    }

    public async Task<TenantLookupDto?> LookupTenantAsync(string tenantIdentifier, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenantIdentifier) ||
            string.Equals(tenantIdentifier, "tenant_default", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var clean = tenantIdentifier.Trim().ToLowerInvariant();
        var isGuid = Guid.TryParse(tenantIdentifier, out var guid);

        // 1. Direct PostgreSQL query against main."Tenants" table ONLY
        try
        {
            var tenantQuery = _dbContext.Tenants.AsNoTracking().Where(t => !t.IsDeleted);
            var dbTenant = isGuid
                ? await tenantQuery.FirstOrDefaultAsync(t => t.Id == guid, ct)
                : await tenantQuery.FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == clean, ct);

            if (dbTenant != null)
            {
                return new TenantLookupDto(dbTenant.Id, dbTenant.TenantSlug, dbTenant.Name);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TenantLookup] Direct database query for tenant '{Identifier}' failed.", tenantIdentifier);
        }

        // 2. HTTP Fallback to Portal API
        try
        {
            var portalBase = ResolvePortalBaseUrl();
            var lookupSlug = isGuid ? tenantIdentifier : clean;
            var response = await _httpClient.GetAsync($"{portalBase}/api/v1/tenants/lookup/{Uri.EscapeDataString(lookupSlug)}", ct);

            if (response.IsSuccessStatusCode)
            {
                var payload = await response.Content.ReadFromJsonAsync<PortalTenantLookupResponse>(cancellationToken: ct);
                if (payload != null && payload.Exists && Guid.TryParse(payload.TenantId, out var parsedGuid))
                {
                    return new TenantLookupDto(
                        parsedGuid,
                        payload.TenantSlug ?? clean,
                        payload.Name ?? clean,
                        null,
                        null);
                }
            }
        }
        catch (Exception httpEx)
        {
            _logger.LogWarning(httpEx, "[TenantLookup] Portal API HTTP lookup for tenant '{Identifier}' failed.", tenantIdentifier);
        }

        return null;
    }

    public async Task<TenantLookupDto?> LookupAsync(string identifier, CancellationToken ct = default)
    {
        return await LookupFacilityAsync(identifier, ct) ?? await LookupTenantAsync(identifier, ct);
    }

    private class PortalTenantLookupResponse
    {
        [JsonPropertyName("exists")]
        public bool Exists { get; set; }

        [JsonPropertyName("tenantId")]
        public string? TenantId { get; set; }

        [JsonPropertyName("tenantSlug")]
        public string? TenantSlug { get; set; }

        [JsonPropertyName("facilityId")]
        public string? FacilityId { get; set; }

        [JsonPropertyName("facilitySlug")]
        public string? FacilitySlug { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }
    }
}
