using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Infrastructure.Clinic;
using ClinicEz.Shared.Common;
using Microsoft.Extensions.Logging;
using Moq;
using Moq.Protected;
using Xunit;

namespace ClinicEz.Portal.Tests.Clinic;

public class ClinicApiClientTests
{
    private readonly Mock<HttpMessageHandler> _httpMessageHandlerMock;
    private readonly Mock<ILogger<ClinicApiClient>> _loggerMock;
    private readonly HttpClient _httpClient;
    private readonly ClinicApiClient _sut;

    public ClinicApiClientTests()
    {
        _httpMessageHandlerMock = new Mock<HttpMessageHandler>();
        _loggerMock = new Mock<ILogger<ClinicApiClient>>();
        _httpClient = new HttpClient(_httpMessageHandlerMock.Object)
        {
            BaseAddress = new Uri("http://clinic-api:8080/")
        };
        _sut = new ClinicApiClient(_httpClient, _loggerMock.Object);
    }

    [Fact]
    public async Task GetTransmittalsAsync_ReturnsData_OnSuccess()
    {
        // Arrange
        var branchId = Guid.NewGuid();
        var tenantId = "tenant_123";
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
                BranchId: branchId)
        };

        var apiResponse = ApiResponse<IReadOnlyList<PortalYakapTransmittalDto>>.Success(expectedTransmittals);
        var json = JsonSerializer.Serialize(apiResponse);

        _httpMessageHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req =>
                    req.Method == HttpMethod.Get &&
                    req.RequestUri!.ToString().Contains($"api/v1/yakap/transmittals?branchId={branchId}") &&
                    req.Headers.Contains("X-Tenant-Id") &&
                    req.Headers.Contains("X-Branch-Id")),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
            });

        // Act
        var result = await _sut.GetTransmittalsAsync(tenantId, branchId, null, null);

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
        var branchId = Guid.NewGuid();
        _httpMessageHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.InternalServerError,
                Content = new StringContent("Internal server error")
            });

        // Act
        var result = await _sut.GetTransmittalsAsync("tenant_123", branchId, null, null);

        // Assert
        Assert.False(result.Succeeded);
        Assert.Contains("500", result.Message);
    }

    [Fact]
    public async Task GetTransmittalsAsync_WhenNetworkFails_ReturnsGracefulConnectionErrorMessage()
    {
        // Arrange
        var branchId = Guid.NewGuid();
        _httpMessageHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ThrowsAsync(new HttpRequestException("Cannot assign requested address (localhost:5245)"));

        // Act
        var result = await _sut.GetTransmittalsAsync("tenant_123", branchId, null, null);

        // Assert
        Assert.False(result.Succeeded);
        Assert.Contains("Unable to connect to Clinic API", result.Message);
        Assert.Contains("http://clinic-api:8080", result.Message);
    }

    [Fact]
    public async Task CreateTransmittalAsync_SendsCorrectPayloadAndReturnsSuccess()
    {
        // Arrange
        var branchId = Guid.NewGuid();
        var transmittalId = Guid.NewGuid();
        var request = new PortalCreateYakapTransmittalRequest(
            ConsultationEncounterIds: new List<Guid> { Guid.NewGuid() },
            ReportTagging: "2",
            EffectiveYear: "2026",
            BranchId: branchId);

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
            BranchId: branchId);

        var apiResponse = ApiResponse<PortalYakapTransmittalDto>.Success(expectedDto);
        var json = JsonSerializer.Serialize(apiResponse);

        _httpMessageHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req =>
                    req.Method == HttpMethod.Post &&
                    req.RequestUri!.ToString().Contains("api/v1/yakap/transmittals")),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
            });

        // Act
        var result = await _sut.CreateTransmittalAsync("tenant_123", branchId, request);

        // Assert
        Assert.True(result.Succeeded);
        Assert.NotNull(result.Data);
        Assert.Equal("TR-NEW-01", result.Data.TransmittalNumber);
    }
}
