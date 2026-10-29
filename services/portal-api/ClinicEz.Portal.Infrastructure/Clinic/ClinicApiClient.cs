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
/// Interop-backed client that routes Zero-PHI YAKAP 2.0 operations to clinic facilities over the Interop Hub
/// using the <c>yakap.submission.requested</c> request/reply pattern.
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

    private async Task<ApiResponse<T>> SendInteropAsync<T>(
        Party to,
        string method,
        string path,
        string? query,
        string? body,
        string operationDescription,
        CancellationToken ct)
    {
        var payload = new YakapSubmissionRequestedPayload
        {
            Method = method,
            Path = path,
            Query = query,
            Body = body
        };

        try
        {
            var reply = await _requestClient.RequestAsync<YakapSubmissionRequestedPayload, YakapSubmissionRespondedPayload>(
                InteropTypes.YakapSubmissionRequested,
                InteropTypes.YakapSubmissionResponded,
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

    public async Task<ApiResponse<PortalYakapBranchSummaryDto>> GetBranchYakapSummaryAsync(
        string tenantId,
        Guid branchId,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        var query = $"branchId={branchId}";
        return await SendInteropAsync<PortalYakapBranchSummaryDto>(
            to, "GET", "submissions/summary", query, null, "get branch yakap summary", ct);
    }

    public async Task<ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>> GetSubmissionsAsync(
        string tenantId,
        Guid branchId,
        string? status = null,
        string? submissionType = null,
        int page = 1,
        int pageSize = 50,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        var query = $"branchId={branchId}&page={page}&pageSize={pageSize}";
        if (!string.IsNullOrWhiteSpace(status)) query += $"&status={Uri.EscapeDataString(status)}";
        if (!string.IsNullOrWhiteSpace(submissionType)) query += $"&submissionType={Uri.EscapeDataString(submissionType)}";

        return await SendInteropAsync<IReadOnlyList<PortalYakapSubmissionDto>>(
            to, "GET", "submissions", query, null, "get submissions", ct);
    }

    public async Task<ApiResponse<PortalYakapSubmissionDto>> GetSubmissionByIdAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        var query = $"branchId={branchId}";
        return await SendInteropAsync<PortalYakapSubmissionDto>(
            to, "GET", $"submissions/{id}", query, null, $"get submission {id}", ct);
    }

    public async Task<ApiResponse<PortalYakapSubmissionDto>> PollSubmissionStatusAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        var query = $"branchId={branchId}";
        return await SendInteropAsync<PortalYakapSubmissionDto>(
            to, "POST", $"submissions/{id}/poll", query, null, $"poll submission {id}", ct);
    }

    public async Task<ApiResponse<PortalYakapSubmissionDto>> RetrySubmissionAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        var query = $"branchId={branchId}";
        return await SendInteropAsync<PortalYakapSubmissionDto>(
            to, "POST", $"submissions/{id}/retry", query, null, $"retry submission {id}", ct);
    }

    public async Task<ApiResponse<PortalYakapMasterlistSyncResultDto>> SyncMasterlistAsync(
        string tenantId,
        Guid branchId,
        CancellationToken ct = default)
    {
        var to = await ResolveClinicPartyAsync(tenantId, branchId, ct);
        var query = $"branchId={branchId}";
        return await SendInteropAsync<PortalYakapMasterlistSyncResultDto>(
            to, "POST", "masterlist/sync", query, null, "sync masterlist", ct);
    }
}
