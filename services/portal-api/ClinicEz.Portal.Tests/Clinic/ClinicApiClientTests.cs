using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
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
    public async Task GetTransmittalsAsync_ReturnsData_OnSuccess()
    {
        // Arrange
        var expectedTransmittals = new List<PortalYakapTransmittalDto>
        {
            new(
                Id: Guid.NewGuid(),
                TransmittalNumber: "TR-2026-0001",
                ReportTagging: "2",
                EffectiveYear: "2026",
                PackageType: "K",
                Status: "Draft",
                PhilHealthTransactionNumber: null,
                EncryptedPayloadHash: null,
                ValidationErrors: new List<string>(),
                SubmittedAt: null,
                SubmittedBy: null,
                CreatedAt: DateTime.UtcNow,
                TotalItemsCount: 1,
                Items: new List<PortalYakapTransmittalItemDto>(),
                BranchId: _branchId)
        };

        var apiResponse = ApiResponse<IReadOnlyList<PortalYakapTransmittalDto>>.Success(expectedTransmittals);
        var json = JsonSerializer.Serialize(apiResponse);

        _requestClientMock
            .Setup(c => c.RequestAsync<YakapTransmittalRequestedPayload, YakapTransmittalRespondedPayload>(
                InteropTypes.YakapTransmittalRequested,
                InteropTypes.YakapTransmittalResponded,
                Party.Portal,
                It.Is<Party>(p => p.Kind == PartyKind.Facility && p.TenantId == _tenantId.ToString()),
                It.Is<YakapTransmittalRequestedPayload>(req => req.Method == "GET" && req.Path == "transmittals"),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new YakapTransmittalRespondedPayload
            {
                StatusCode = 200,
                Body = json
            });

        // Act
        var result = await _sut.GetTransmittalsAsync(_tenantId.ToString(), _branchId, null, null);

        // Assert
        Assert.True(result.Succeeded);
        Assert.NotNull(result.Data);
        Assert.Single(result.Data);
        Assert.Equal("TR-2026-0001", result.Data[0].TransmittalNumber);
    }

    [Fact]
    public async Task GetTransmittalsAsync_WhenClinicApiReturnsErrorStatus_ReturnsFailResponse()
    {
        // Arrange
        var errorResponse = ApiResponse<IReadOnlyList<PortalYakapTransmittalDto>>.Fail("Internal clinic error");
        var json = JsonSerializer.Serialize(errorResponse);

        _requestClientMock
            .Setup(c => c.RequestAsync<YakapTransmittalRequestedPayload, YakapTransmittalRespondedPayload>(
                InteropTypes.YakapTransmittalRequested,
                InteropTypes.YakapTransmittalResponded,
                Party.Portal,
                It.IsAny<Party>(),
                It.IsAny<YakapTransmittalRequestedPayload>(),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new YakapTransmittalRespondedPayload
            {
                StatusCode = 500,
                Body = json
            });

        // Act
        var result = await _sut.GetTransmittalsAsync(_tenantId.ToString(), _branchId, null, null);

        // Assert
        Assert.False(result.Succeeded);
        Assert.Contains("Internal clinic error", result.Message);
    }

    [Fact]
    public async Task GetTransmittalsAsync_WhenNetworkFails_ReturnsGracefulConnectionErrorMessage()
    {
        // Arrange
        _requestClientMock
            .Setup(c => c.RequestAsync<YakapTransmittalRequestedPayload, YakapTransmittalRespondedPayload>(
                InteropTypes.YakapTransmittalRequested,
                InteropTypes.YakapTransmittalResponded,
                Party.Portal,
                It.IsAny<Party>(),
                It.IsAny<YakapTransmittalRequestedPayload>(),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InteropRequestTimeoutException(InteropTypes.YakapTransmittalRequested, Guid.NewGuid(), TimeSpan.FromSeconds(45)));

        // Act
        var result = await _sut.GetTransmittalsAsync(_tenantId.ToString(), _branchId, null, null);

        // Assert
        Assert.False(result.Succeeded);
        Assert.Contains("timed out", result.Message);
        Assert.Contains("Interop Hub", result.Message);
    }

    [Fact]
    public async Task CreateTransmittalAsync_SendsCorrectPayloadAndReturnsSuccess()
    {
        // Arrange
        var transmittalId = Guid.NewGuid();
        var request = new PortalCreateYakapTransmittalRequest(
            ConsultationEncounterIds: new List<Guid> { Guid.NewGuid() },
            ReportTagging: "2",
            EffectiveYear: "2026",
            BranchId: _branchId);

        var expectedDto = new PortalYakapTransmittalDto(
            Id: transmittalId,
            TransmittalNumber: "TR-NEW-01",
            ReportTagging: "2",
            EffectiveYear: "2026",
            PackageType: "K",
            Status: "Draft",
            PhilHealthTransactionNumber: null,
            EncryptedPayloadHash: null,
            ValidationErrors: new List<string>(),
            SubmittedAt: null,
            SubmittedBy: null,
            CreatedAt: DateTime.UtcNow,
            TotalItemsCount: 1,
            Items: new List<PortalYakapTransmittalItemDto>(),
            BranchId: _branchId);

        var apiResponse = ApiResponse<PortalYakapTransmittalDto>.Success(expectedDto);
        var json = JsonSerializer.Serialize(apiResponse);

        _requestClientMock
            .Setup(c => c.RequestAsync<YakapTransmittalRequestedPayload, YakapTransmittalRespondedPayload>(
                InteropTypes.YakapTransmittalRequested,
                InteropTypes.YakapTransmittalResponded,
                Party.Portal,
                It.Is<Party>(p => p.Kind == PartyKind.Facility && p.TenantId == _tenantId.ToString()),
                It.Is<YakapTransmittalRequestedPayload>(req => req.Method == "POST" && req.Path == "transmittals"),
                It.IsAny<TimeSpan?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new YakapTransmittalRespondedPayload
            {
                StatusCode = 200,
                Body = json
            });

        // Act
        var result = await _sut.CreateTransmittalAsync(_tenantId.ToString(), _branchId, request);

        // Assert
        Assert.True(result.Succeeded);
        Assert.NotNull(result.Data);
        Assert.Equal("TR-NEW-01", result.Data.TransmittalNumber);
    }
}
