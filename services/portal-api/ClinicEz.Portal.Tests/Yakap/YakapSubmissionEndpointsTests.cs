using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Xunit;

namespace ClinicEz.Portal.Tests.Yakap;

public sealed class YakapSubmissionEndpointsTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant;
    private readonly Branch _branch;
    private readonly string _ownerId = "owner-yakap-user";
    private readonly string _staffId = "staff-yakap-user";
    private readonly string _strangerId = "stranger-user";

    public YakapSubmissionEndpointsTests()
    {
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "yakap-test-health",
            Name = "Yakap Test Health",
            OwnerId = _ownerId,
            Email = "admin@yakap.test"
        };

        _branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "Yakap Main Branch",
            IsActive = true,
            PhilHealthAccreditationNumber = "H91001234",
            PhilHealthPmccNumber = "Z15445",
            PhilHealthSoftwareCertificateId = "KON-CERT",
            PhilHealthBaseUrl = "https://pcapi.philhealth.gov.ph"
        };

        var staffMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            UserId = _staffId,
            Status = MemberStatus.Active,
            Role = WorkspaceMemberRole.Member
        };

        _context.Tenants.Add(_tenant);
        _context.Branches.Add(_branch);
        _context.WorkspaceMembers.Add(staffMember);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private static HttpContext CreateContextWithUser(string? userId)
    {
        var httpContext = new DefaultHttpContext();
        if (!string.IsNullOrEmpty(userId))
        {
            var identity = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, userId)
            }, "TestAuth");
            httpContext.User = new ClaimsPrincipal(identity);
        }
        return httpContext;
    }

    private sealed class FakeClinicApiClient : IClinicApiClient
    {
        public Task<ApiResponse<PortalYakapBranchSummaryDto>> GetBranchYakapSummaryAsync(
            string tenantId, Guid branchId, CancellationToken ct = default)
        {
            return Task.FromResult(ApiResponse<PortalYakapBranchSummaryDto>.Success(new PortalYakapBranchSummaryDto
            {
                BranchId = branchId,
                AccreditationNo = "H91001234",
                EmpaneledCount = 150,
                SelectedCount = 80,
                AcceptedUploadsCount = 75,
                PendingPollingCount = 5,
                RejectedOrFailedCount = 2,
                MasterlistTotalCount = 200
            }));
        }

        public Task<ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>> GetSubmissionsAsync(
            string tenantId, Guid branchId, string? status = null, string? submissionType = null,
            int page = 1, int pageSize = 50, CancellationToken ct = default)
        {
            var list = new List<PortalYakapSubmissionDto>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    PatientCode = "PAT-001",
                    AccreditationNo = "H91001234",
                    SubmissionType = "Profile",
                    LocalTransactionNo = "TX-001",
                    ProcessingStatus = "Accepted"
                }
            };
            return Task.FromResult(ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>.Success(list));
        }

        public Task<ApiResponse<PortalYakapSubmissionDto>> GetSubmissionByIdAsync(
            string tenantId, Guid branchId, Guid id, CancellationToken ct = default)
        {
            if (id == Guid.Empty)
            {
                return Task.FromResult(ApiResponse<PortalYakapSubmissionDto>.Fail("Submission not found."));
            }

            return Task.FromResult(ApiResponse<PortalYakapSubmissionDto>.Success(new PortalYakapSubmissionDto
            {
                Id = id,
                PatientCode = "PAT-001",
                AccreditationNo = "H91001234",
                SubmissionType = "Profile",
                LocalTransactionNo = "TX-001",
                ProcessingStatus = "Accepted"
            }));
        }

        public Task<ApiResponse<PortalYakapSubmissionDto>> PollSubmissionStatusAsync(
            string tenantId, Guid branchId, Guid id, CancellationToken ct = default)
        {
            return Task.FromResult(ApiResponse<PortalYakapSubmissionDto>.Success(new PortalYakapSubmissionDto
            {
                Id = id,
                PatientCode = "PAT-001",
                AccreditationNo = "H91001234",
                SubmissionType = "Profile",
                LocalTransactionNo = "TX-001",
                ProcessingStatus = "Polled_Valid"
            }));
        }

        public Task<ApiResponse<PortalYakapSubmissionDto>> RetrySubmissionAsync(
            string tenantId, Guid branchId, Guid id, CancellationToken ct = default)
        {
            return Task.FromResult(ApiResponse<PortalYakapSubmissionDto>.Success(new PortalYakapSubmissionDto
            {
                Id = id,
                PatientCode = "PAT-001",
                AccreditationNo = "H91001234",
                SubmissionType = "Profile",
                LocalTransactionNo = "TX-001",
                ProcessingStatus = "Retrying"
            }));
        }

        public Task<ApiResponse<PortalYakapMasterlistSyncResultDto>> SyncMasterlistAsync(
            string tenantId, Guid branchId, CancellationToken ct = default)
        {
            return Task.FromResult(ApiResponse<PortalYakapMasterlistSyncResultDto>.Success(new PortalYakapMasterlistSyncResultDto
            {
                Success = true,
                RecordsAdded = 10,
                RecordsUpdated = 5,
                TotalActiveCount = 200,
                SyncedAtUtc = DateTime.UtcNow,
                Message = "Masterlist sync complete."
            }));
        }
    }

    private sealed class FakePhilHealthPcapiTester : IPhilHealthPcapiTester
    {
        public Task<PhilHealthTestConnectionResult> TestConnectionAsync(
            string accreditationNumber,
            string secretKey,
            string? softwareCertificateId = null,
            string? baseUrl = null,
            CancellationToken ct = default)
        {
            return Task.FromResult(new PhilHealthTestConnectionResult(
                true,
                "Authentication successful! PhilHealth gateway accepted facility credentials.",
                "SIM_OR_PROBE_TOKEN_123",
                LatencyMs: 25));
        }
    }

    [Fact]
    public async Task GetBranchYakapSummaryAsync_Anonymous_ReturnsUnauthorized()
    {
        var httpContext = CreateContextWithUser(null);
        var clinicClient = new FakeClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchYakapSummaryAsync(
            _branch.Id, httpContext, _context, clinicClient, CancellationToken.None);

        var unauthorized = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorized.StatusCode);
    }

    [Fact]
    public async Task GetBranchYakapSummaryAsync_UnknownBranch_ReturnsNotFound()
    {
        var httpContext = CreateContextWithUser(_ownerId);
        var clinicClient = new FakeClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchYakapSummaryAsync(
            Guid.NewGuid(), httpContext, _context, clinicClient, CancellationToken.None);

        var notFound = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFound.StatusCode);
    }

    [Fact]
    public async Task GetBranchYakapSummaryAsync_Stranger_ReturnsForbid()
    {
        var httpContext = CreateContextWithUser(_strangerId);
        var clinicClient = new FakeClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchYakapSummaryAsync(
            _branch.Id, httpContext, _context, clinicClient, CancellationToken.None);

        var forbid = Assert.IsType<ForbidHttpResult>(result);
        Assert.NotNull(forbid);
    }

    [Fact]
    public async Task GetBranchYakapSummaryAsync_AuthorizedOwner_ReturnsSummary()
    {
        var httpContext = CreateContextWithUser(_ownerId);
        var clinicClient = new FakeClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchYakapSummaryAsync(
            _branch.Id, httpContext, _context, clinicClient, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<PortalYakapBranchSummaryDto>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.Equal(_branch.Id, apiResponse.Data.BranchId);
        Assert.Equal(150, apiResponse.Data.EmpaneledCount);
    }

    [Fact]
    public async Task GetBranchSubmissionsAsync_AuthorizedStaff_ReturnsSubmissionsList()
    {
        var httpContext = CreateContextWithUser(_staffId);
        var clinicClient = new FakeClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchSubmissionsAsync(
            _branch.Id, status: null, submissionType: null, page: 1, pageSize: 50,
            httpContext, _context, clinicClient, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.Single(apiResponse.Data);
        Assert.Equal("PAT-001", apiResponse.Data[0].PatientCode);
    }

    [Fact]
    public async Task GetSubmissionByIdAsync_ValidId_ReturnsSubmission()
    {
        var httpContext = CreateContextWithUser(_ownerId);
        var clinicClient = new FakeClinicApiClient();
        var submissionId = Guid.NewGuid();

        var result = await YakapSubmissionEndpoints.GetSubmissionByIdAsync(
            _branch.Id, submissionId, httpContext, _context, clinicClient, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<PortalYakapSubmissionDto>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.Equal(submissionId, apiResponse.Data.Id);
    }

    [Fact]
    public async Task PollSubmissionStatusAsync_Authorized_ReturnsUpdatedStatus()
    {
        var httpContext = CreateContextWithUser(_ownerId);
        var clinicClient = new FakeClinicApiClient();
        var submissionId = Guid.NewGuid();

        var result = await YakapSubmissionEndpoints.PollSubmissionStatusAsync(
            _branch.Id, submissionId, httpContext, _context, clinicClient, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<PortalYakapSubmissionDto>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.Equal("Polled_Valid", apiResponse.Data!.ProcessingStatus);
    }

    [Fact]
    public async Task RetrySubmissionAsync_Authorized_ReturnsRetryingStatus()
    {
        var httpContext = CreateContextWithUser(_ownerId);
        var clinicClient = new FakeClinicApiClient();
        var submissionId = Guid.NewGuid();

        var result = await YakapSubmissionEndpoints.RetrySubmissionAsync(
            _branch.Id, submissionId, httpContext, _context, clinicClient, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<PortalYakapSubmissionDto>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.Equal("Retrying", apiResponse.Data!.ProcessingStatus);
    }

    [Fact]
    public async Task SyncMasterlistAsync_Authorized_ReturnsSyncResult()
    {
        var httpContext = CreateContextWithUser(_ownerId);
        var clinicClient = new FakeClinicApiClient();

        var result = await YakapSubmissionEndpoints.SyncMasterlistAsync(
            _branch.Id, httpContext, _context, clinicClient, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<PortalYakapMasterlistSyncResultDto>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.Equal(10, apiResponse.Data!.RecordsAdded);
    }

    [Fact]
    public async Task TestConnectionAsync_InvokesPcapiTesterAndReturnsResult()
    {
        var tester = new FakePhilHealthPcapiTester();
        var request = new TestPcapiConnectionRequest(
            AccreditationNumber: "H91001234",
            SecretKey: "secret",
            SoftwareCertificateId: "CERT-01",
            BaseUrl: "https://pcapi.philhealth.gov.ph");

        var result = await YakapSubmissionEndpoints.TestConnectionAsync(
            request, tester, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<PhilHealthTestConnectionResult>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.True(apiResponse.Data!.Success);
        Assert.Equal("SIM_OR_PROBE_TOKEN_123", apiResponse.Data.Token);
    }
}
