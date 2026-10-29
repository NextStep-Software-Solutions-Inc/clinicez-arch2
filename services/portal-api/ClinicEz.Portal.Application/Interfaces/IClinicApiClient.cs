using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Portal.Application.Interfaces;

public interface IClinicApiClient
{
    Task<ApiResponse<PortalYakapBranchSummaryDto>> GetBranchYakapSummaryAsync(
        string tenantId,
        Guid branchId,
        CancellationToken ct = default);

    Task<ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>> GetSubmissionsAsync(
        string tenantId,
        Guid branchId,
        string? status = null,
        string? submissionType = null,
        int page = 1,
        int pageSize = 50,
        CancellationToken ct = default);

    Task<ApiResponse<PortalYakapSubmissionDto>> GetSubmissionByIdAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default);

    Task<ApiResponse<PortalYakapSubmissionDto>> PollSubmissionStatusAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default);

    Task<ApiResponse<PortalYakapSubmissionDto>> RetrySubmissionAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default);

    Task<ApiResponse<PortalYakapMasterlistSyncResultDto>> SyncMasterlistAsync(
        string tenantId,
        Guid branchId,
        CancellationToken ct = default);
}
