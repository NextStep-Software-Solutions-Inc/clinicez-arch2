using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Common;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Clinic;

/// <summary>
/// Interop-backed client that routes YAKAP transmittal operations to clinic facilities over the Interop Hub
/// using the <c>yakap.transmittal.requested</c> request/reply pattern. Replaces direct HTTP calls.
/// </summary>
public sealed class ClinicApiClient : IClinicApiClient
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(45);
    private readonly IInteropRequestClient _requestClient;
    private readonly IApplicationDbContext _dbContext;
    private readonly ILogger<ClinicApiClient> _logger;
    private readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true }.UseStrictStringEnums();

    public ClinicApiClient(
        IInteropRequestClient requestClient,
        IApplicationDbContext dbContext,
        ILogger<ClinicApiClient> logger)
    {
        _requestClient = requestClient;
        _dbContext = dbContext;
        _logger = logger;
    }

    private async Task<Party> ResolveClinicPartyAsync(string tenantId, Guid branchId, CancellationToken ct)
    {
        // Try to locate the Clinic facility operating inside this branch
        var facility = await _dbContext.Facilities
            .AsNoTracking()
            .FirstOrDefaultAsync(f => !f.IsDeleted && f.FacilityType == FacilityType.Clinic &&
                (f.BranchId == branchId || f.Id == branchId), ct);

        var facilityId = facility?.Id ?? branchId;
        var resolvedTenant = facility?.TenantId.ToString() ?? (!string.IsNullOrWhiteSpace(tenantId) ? tenantId : string.Empty);
        return Party.ForFacility(resolvedTenant, facilityId.ToString(), FacilityType.Clinic);
    }

    private async Task<Party> ResolveClinicPartyForTransmittalAsync(string tenantId, Guid? branchId, CancellationToken ct)
    {
        if (branchId.HasValue && branchId.Value != Guid.Empty)
        {
            return await ResolveClinicPartyAsync(tenantId, branchId.Value, ct);
        }

        // Fallback: look up the tenant's first active clinic facility
        if (Guid.TryParse(tenantId, out var tGuid))
        {
            var facility = await _dbContext.Facilities
                .AsNoTracking()
                .FirstOrDefaultAsync(f => !f.IsDeleted && f.TenantId == tGuid && f.FacilityType == FacilityType.Clinic, ct);
            if (facility != null)
            {
                return Party.ForFacility(facility.TenantId.ToString(), facility.Id.ToString(), FacilityType.Clinic);
            }
        }

        return Party.ForFacility(tenantId, (branchId ?? Guid.Empty).ToString(), FacilityType.Clinic);
    }

    private async Task<ApiResponse<T>> SendInteropAsync<T>(
        Party to,
        string method,
        string path,
        string? query,
        string? body,
        string operationDescription,
        CancellationToken ct)
    {
        var payload = new YakapTransmittalRequestedPayload
        {
            Method = method,
            Path = path,
            Query = query,
            Body = body
        };

        try
        {
            var reply = await _requestClient.RequestAsync<YakapTransmittalRequestedPayload, YakapTransmittalRespondedPayload>(
                InteropTypes.YakapTransmittalRequested,
                InteropTypes.YakapTransmittalResponded,
                Party.Portal,
                to,
                payload,
                Timeout,
                ct);

            if (string.IsNullOrWhiteSpace(reply.Body))
            {
                return ApiResponse<T>.Fail($"Clinic Interop returned status {reply.StatusCode} with empty body.");
            }

            var result = JsonSerializer.Deserialize<ApiResponse<T>>(reply.Body, _jsonOptions);
            return result ?? ApiResponse<T>.Fail("Invalid JSON response from Clinic Interop.");
        }
        catch (InteropRequestTimeoutException ex)
        {
            _logger.LogError(ex, "Timeout communicating with Clinic Interop ({To}) during {Operation}",
                to.Address, operationDescription);
            return ApiResponse<T>.Fail($"Request to Clinic Interop timed out after {ex.Timeout.TotalSeconds}s (correlation {ex.CorrelationId}). Please ensure the clinic service is running and connected to the Interop Hub.");
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error communicating with Clinic Interop ({To}) during {Operation}",
                to.Address, operationDescription);
            return ApiResponse<T>.Fail($"Unexpected error calling Clinic Interop: {ex.Message}");
        }
    }

    public async Task<ApiResponse<List<PortalEligibleYakapEncounterDto>>> GetEligibleEncountersAsync(
        string tenantId,
        Guid branchId,
        string reportTagging,
        DateTime? startDate,
        DateTime? endDate,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        var query = $"reportTagging={Uri.EscapeDataString(reportTagging)}&branchId={branchId}";
        if (startDate.HasValue) query += $"&startDate={startDate.Value:O}";
        if (endDate.HasValue) query += $"&endDate={endDate.Value:O}";

        return await SendInteropAsync<List<PortalEligibleYakapEncounterDto>>(
            to, "GET", "encounters/eligible", query, null, "get eligible encounters", ct);
    }

    public async Task<ApiResponse<IReadOnlyList<PortalYakapTransmittalDto>>> GetTransmittalsAsync(
        string tenantId,
        Guid branchId,
        string? status,
        string? reportTagging,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        var query = $"branchId={branchId}";
        if (!string.IsNullOrWhiteSpace(status)) query += $"&status={Uri.EscapeDataString(status)}";
        if (!string.IsNullOrWhiteSpace(reportTagging)) query += $"&reportTagging={Uri.EscapeDataString(reportTagging)}";

        return await SendInteropAsync<IReadOnlyList<PortalYakapTransmittalDto>>(
            to, "GET", "transmittals", query, null, "get transmittals", ct);
    }

    public async Task<ApiResponse<PortalYakapTransmittalDto>> GetTransmittalByIdAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyForTransmittalAsync(tenantId, null, ct);
        return await SendInteropAsync<PortalYakapTransmittalDto>(
            to, "GET", $"transmittals/{id}", null, null, $"get transmittal {id}", ct);
    }

    public async Task<ApiResponse<string>> GetTransmittalRawXmlAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyForTransmittalAsync(tenantId, null, ct);
        return await SendInteropAsync<string>(
            to, "GET", $"transmittals/{id}/xml", null, null, $"get transmittal XML {id}", ct);
    }

    public async Task<ApiResponse<PortalYakapTransmittalDto>> CreateTransmittalAsync(
        string tenantId,
        Guid branchId,
        PortalCreateYakapTransmittalRequest requestPayload,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        var body = JsonSerializer.Serialize(new
        {
            ConsultationEncounterIds = requestPayload.ConsultationEncounterIds,
            ReportTagging = requestPayload.ReportTagging,
            EffectiveYear = requestPayload.EffectiveYear,
            BranchId = branchId
        }, _jsonOptions);

        return await SendInteropAsync<PortalYakapTransmittalDto>(
            to, "POST", "transmittals", null, body, "create transmittal", ct);
    }

    public async Task<ApiResponse<PortalYakapValidationResultDto>> ValidateTransmittalAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyForTransmittalAsync(tenantId, null, ct);
        return await SendInteropAsync<PortalYakapValidationResultDto>(
            to, "POST", $"transmittals/{id}/validate", null, null, $"validate transmittal {id}", ct);
    }

    public async Task<ApiResponse<PortalYakapSubmissionResultDto>> SubmitTransmittalAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        return await SendInteropAsync<PortalYakapSubmissionResultDto>(
            to, "POST", $"transmittals/{id}/submit", null, null, $"submit transmittal {id}", ct);
    }
}
