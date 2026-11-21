using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Clinic;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Clinic;

public class ClinicApiClientTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly Mock<IInteropRequestClient> _requestClientMock;
    private readonly Mock<ILogger<ClinicApiClient>> _loggerMock;
    private readonly ClinicApiClient _sut;
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _branchId = Guid.NewGuid();

    public ClinicApiClientTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
        _requestClientMock = new Mock<IInteropRequestClient>();
        _loggerMock = new Mock<ILogger<ClinicApiClient>>();

        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            BranchId = _branchId,
            FacilityType = FacilityType.Clinic,
            Name = "Metro Clinic",
            Slug = "metro-clinic"
        };
        _dbContext.Facilities.Add(facility);
        _dbContext.SaveChanges();

        _sut = new ClinicApiClient(_requestClientMock.Object, _dbContext, _loggerMock.Object);
    }

    public void Dispose()
    {
        _dbContext.Database.EnsureDeleted();
        _dbContext.Dispose();
    }

    [Fact]
    public async Task GetSubmissionsAsync_ReturnsData_OnSuccess()
    {
        // Arrange
        var expectedSubmissions = new List<PortalYakapSubmissionDto>
        {
            new()
            {
                Id = Guid.NewGuid(),
                PatientCode = "PT-001",
                AccreditationNo = "H91001111",
                CaseNo = "CASE-01",
                SubmissionType = "Service01_Registration",
                ReportStatus = "U",
                LocalTransactionNo = "TX-001",
                ProcessingStatus = "Accepted",
                SubmittedAtUtc = DateTime.UtcNow
            }
        };

        var apiResponse = ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>.Success(expectedSubmissions);
        var json = JsonSerializer.Serialize(apiResponse);

        _requestClientMock
            .Setup(c => c.RequestAsync<YakapSubmissionRequestedPayload, YakapSubmissionRespondedPayload>(
                InteropTypes.YakapSubmissionRequested,
                InteropTypes.YakapSubmissionResponded,
                Party.Portal,
                It.Is<Party>(p => p.Kind == PartyKind.Facility && p.TenantId == _tenantId.ToString()),
                It.Is<YakapSubmissionRequestedPayload>(req => req.Method == "GET" && req.Path == "submissions"),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new YakapSubmissionRespondedPayload
            {
                StatusCode = 200,
                Body = json
            });

        // Act
        var result = await _sut.GetSubmissionsAsync(_tenantId.ToString(), _branchId);

        // Assert
        Assert.True(result.Succeeded);
        Assert.NotNull(result.Data);
        Assert.Single(result.Data);
        Assert.Equal("PT-001", result.Data[0].PatientCode);
    }

    [Fact]
    public async Task GetSubmissionsAsync_WhenClinicApiReturnsErrorStatus_ReturnsFailResponse()
    {
        // Arrange
        var errorResponse = ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>.Fail("Internal clinic error");
        var json = JsonSerializer.Serialize(errorResponse);

        _requestClientMock
            .Setup(c => c.RequestAsync<YakapSubmissionRequestedPayload, YakapSubmissionRespondedPayload>(
                InteropTypes.YakapSubmissionRequested,
                InteropTypes.YakapSubmissionResponded,
                Party.Portal,
                It.IsAny<Party>(),
                It.IsAny<YakapSubmissionRequestedPayload>(),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new YakapSubmissionRespondedPayload
            {
                StatusCode = 500,
                Body = json
            });

        // Act
        var result = await _sut.GetSubmissionsAsync(_tenantId.ToString(), _branchId);

        // Assert
        Assert.False(result.Succeeded);
        Assert.Contains("Internal clinic error", result.Message);
    }

    [Fact]
    public async Task GetSubmissionsAsync_WhenNetworkFails_ReturnsGracefulConnectionErrorMessage()
    {
        // Arrange
        _requestClientMock
            .Setup(c => c.RequestAsync<YakapSubmissionRequestedPayload, YakapSubmissionRespondedPayload>(
                InteropTypes.YakapSubmissionRequested,
                InteropTypes.YakapSubmissionResponded,
                Party.Portal,
                It.IsAny<Party>(),
                It.IsAny<YakapSubmissionRequestedPayload>(),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InteropRequestTimeoutException(InteropTypes.YakapSubmissionRequested, Guid.NewGuid(), TimeSpan.FromSeconds(45)));

        // Act
        var result = await _sut.GetSubmissionsAsync(_tenantId.ToString(), _branchId);

        // Assert
        Assert.False(result.Succeeded);
        Assert.Contains("timed out", result.Message);
        Assert.Contains("Interop Hub", result.Message);
    }

    [Fact]
    public async Task GetBranchYakapSummaryAsync_ReturnsSummaryData()
    {
        // Arrange
        var expectedSummary = new PortalYakapBranchSummaryDto
        {
            BranchId = _branchId,
            AccreditationNo = "H91001111",
            EmpaneledCount = 100,
            SelectedCount = 80,
            AcceptedUploadsCount = 75,
            PendingPollingCount = 5,
            RejectedOrFailedCount = 0,
            MasterlistTotalCount = 100
        };

        var apiResponse = ApiResponse<PortalYakapBranchSummaryDto>.Success(expectedSummary);
        var json = JsonSerializer.Serialize(apiResponse);

        _requestClientMock
            .Setup(c => c.RequestAsync<YakapSubmissionRequestedPayload, YakapSubmissionRespondedPayload>(
                InteropTypes.YakapSubmissionRequested,
                InteropTypes.YakapSubmissionResponded,
                Party.Portal,
                It.Is<Party>(p => p.Kind == PartyKind.Facility && p.TenantId == _tenantId.ToString()),
                It.Is<YakapSubmissionRequestedPayload>(req => req.Method == "GET" && req.Path == "submissions/summary"),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new YakapSubmissionRespondedPayload
            {
                StatusCode = 200,
                Body = json
            });

        // Act
        var result = await _sut.GetBranchYakapSummaryAsync(_tenantId.ToString(), _branchId);

        // Assert
        Assert.True(result.Succeeded);
        Assert.NotNull(result.Data);
        Assert.Equal(100, result.Data.EmpaneledCount);
        Assert.Equal("H91001111", result.Data.AccreditationNo);
    }

    [Fact]
    public async Task SyncMasterlistAsync_SendsCorrectPayloadAndReturnsSuccess()
    {
        // Arrange
        var expectedSyncResult = new PortalYakapMasterlistSyncResultDto
        {
            Success = true,
            RecordsAdded = 10,
            RecordsUpdated = 5,
            TotalActiveCount = 15,
            SyncedAtUtc = DateTime.UtcNow,
            Message = "Sync completed successfully"
        };

        var apiResponse = ApiResponse<PortalYakapMasterlistSyncResultDto>.Success(expectedSyncResult);
        var json = JsonSerializer.Serialize(apiResponse);

        _requestClientMock
            .Setup(c => c.RequestAsync<YakapSubmissionRequestedPayload, YakapSubmissionRespondedPayload>(
                InteropTypes.YakapSubmissionRequested,
                InteropTypes.YakapSubmissionResponded,
                Party.Portal,
                It.Is<Party>(p => p.Kind == PartyKind.Facility && p.TenantId == _tenantId.ToString()),
                It.Is<YakapSubmissionRequestedPayload>(req => req.Method == "POST" && req.Path == "masterlist/sync"),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new YakapSubmissionRespondedPayload
            {
                StatusCode = 200,
                Body = json
            });

        // Act
        var result = await _sut.SyncMasterlistAsync(_tenantId.ToString(), _branchId);

        // Assert
        Assert.True(result.Succeeded);
        Assert.NotNull(result.Data);
        Assert.True(result.Data.Success);
        Assert.Equal(10, result.Data.RecordsAdded);
    }
}
