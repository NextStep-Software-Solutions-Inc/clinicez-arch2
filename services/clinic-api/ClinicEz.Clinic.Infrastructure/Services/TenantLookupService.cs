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

        // 1. Direct PostgreSQL query against shared main."Tenants" table
        try
        {
            var query = _dbContext.Tenants.AsNoTracking().Where(t => !t.IsDeleted);

            var dbRecord = isGuid
                ? await query.FirstOrDefaultAsync(t => t.Id == guid, ct)
                : await query.FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == clean, ct);

            if (dbRecord != null)
            {
                return new TenantLookupDto(dbRecord.Id, dbRecord.TenantSlug, dbRecord.Name);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TenantLookup] Direct database query for tenant '{Identifier}' failed. Falling back to HTTP lookup.", identifier);
        }

        // 2. HTTP Fallback to Portal API
        try
        {
            var portalBase = _configuration["Services:PortalApiUrl"] ??
                             _configuration["PortalSettings:PortalApiUrl"] ??
                             Environment.GetEnvironmentVariable("PORTAL_API_URL") ??
                             "https://clinicez-portal.api.dev.nextstep-software.com";

            portalBase = portalBase.TrimEnd('/');
            var lookupSlug = isGuid ? identifier : clean;
            var response = await _httpClient.GetAsync($"{portalBase}/api/v1/tenants/lookup/{Uri.EscapeDataString(lookupSlug)}", ct);

            if (response.IsSuccessStatusCode)
            {
                var payload = await response.Content.ReadFromJsonAsync<PortalTenantLookupResponse>(cancellationToken: ct);
                if (payload != null && payload.Exists && Guid.TryParse(payload.TenantId, out var parsedGuid))
                {
                    return new TenantLookupDto(parsedGuid, payload.TenantSlug ?? clean, payload.Name ?? clean);
                }
            }
        }
        catch (Exception httpEx)
        {
            _logger.LogDebug(httpEx, "[TenantLookup] Portal API HTTP lookup for tenant '{Identifier}' failed.", identifier);
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

        [JsonPropertyName("name")]
        public string? Name { get; set; }
    }
}
