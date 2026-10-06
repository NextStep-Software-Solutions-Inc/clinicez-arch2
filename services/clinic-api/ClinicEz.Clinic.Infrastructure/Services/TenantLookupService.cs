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

    public async Task<TenantLookupDto?> LookupAsync(string identifier, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(identifier) ||
            string.Equals(identifier, "tenant_default", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var clean = identifier.Trim().ToLowerInvariant();
        var isGuid = Guid.TryParse(identifier, out var guid);

        // 1. Direct PostgreSQL query against shared main."Tenants" and main."Facilities" tables
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

            // Also check main."Facilities" table for facility slug lookup (e.g. "clinic-b")
            var facQuery = _dbContext.Facilities.AsNoTracking().Where(f => !f.IsDeleted);
            var dbFacility = isGuid
                ? await facQuery.FirstOrDefaultAsync(f => f.Id == guid, ct)
                : await facQuery.FirstOrDefaultAsync(f => f.Slug.ToLower() == clean, ct);

            if (dbFacility != null)
            {
                var parentTenant = await tenantQuery.FirstOrDefaultAsync(t => t.Id == dbFacility.TenantId, ct);
                if (parentTenant != null)
                {
                    return new TenantLookupDto(parentTenant.Id, parentTenant.TenantSlug, dbFacility.Name, dbFacility.Id, dbFacility.Slug);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TenantLookup] Direct database query for tenant/facility '{Identifier}' failed. Falling back to HTTP lookup.", identifier);
        }

        // 2. HTTP Fallback to Portal API
        try
        {
            var portalBase = _configuration["Services:PortalApiUrl"] ??
                             _configuration["PortalSettings:PortalApiUrl"] ??
                             Environment.GetEnvironmentVariable("PORTAL_API_URL") ??
                             Environment.GetEnvironmentVariable("SERVICES_PORTAL_API_URL") ??
                             "https://clinicez-portal.api.dev.nextstep-software.com";

            portalBase = portalBase.TrimEnd('/');
            var lookupSlug = isGuid ? identifier : clean;
            var response = await _httpClient.GetAsync($"{portalBase}/api/v1/tenants/lookup/{Uri.EscapeDataString(lookupSlug)}", ct);

            if (response.IsSuccessStatusCode)
            {
                var payload = await response.Content.ReadFromJsonAsync<PortalTenantLookupResponse>(cancellationToken: ct);
                if (payload != null && payload.Exists && Guid.TryParse(payload.TenantId, out var parsedGuid))
                {
                    Guid? parsedFacilityId = Guid.TryParse(payload.FacilityId, out var fId) ? fId : null;
                    return new TenantLookupDto(
                        parsedGuid,
                        payload.TenantSlug ?? clean,
                        payload.Name ?? clean,
                        parsedFacilityId,
                        payload.FacilitySlug);
                }
            }
        }
        catch (Exception httpEx)
        {
            _logger.LogWarning(httpEx, "[TenantLookup] Portal API HTTP lookup for tenant '{Identifier}' failed.", identifier);
        }

        return null;
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
