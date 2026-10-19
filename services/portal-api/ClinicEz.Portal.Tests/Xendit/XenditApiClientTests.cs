using System;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Infrastructure.Xendit;
using ClinicEz.Portal.Infrastructure.Xendit.Models.Invoices;
using Moq;
using Moq.Protected;
using Xunit;

namespace ClinicEz.Portal.Tests.Xendit;

public class XenditApiClientTests
{
    private readonly Mock<HttpMessageHandler> _httpMessageHandlerMock;
    private readonly HttpClient _httpClient;
    private readonly XenditApiClient _sut; // System Under Test

    public XenditApiClientTests()
    {
        _httpMessageHandlerMock = new Mock<HttpMessageHandler>();
        _httpClient = new HttpClient(_httpMessageHandlerMock.Object)
        {
            BaseAddress = new Uri("https://api.xendit.co")
        };
        _sut = new XenditApiClient(_httpClient);
    }

    [Fact]
    public async Task CreateInvoiceAsync_ReturnsInvoiceResponse_OnSuccess()
    {
        // Arrange
        var request = new XenditInvoiceRequest
        {
            ExternalId = "test-123",
            Amount = 1000,
            PayerEmail = "test@example.com",
            Description = "Test Invoice"
        };

        var expectedResponse = new XenditInvoiceResponse
        {
            Id = "inv_123",
            ExternalId = "test-123",
            Amount = 1000,
            Status = "PENDING",
            InvoiceUrl = "https://checkout.xendit.co/web/123"
        };

        var jsonResponse = JsonSerializer.Serialize(expectedResponse);

        _httpMessageHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.Method == HttpMethod.Post && req.RequestUri!.ToString() == "https://api.xendit.co/v2/invoices"),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(jsonResponse)
            });

        // Act
        var result = await _sut.CreateInvoiceAsync(request);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("inv_123", result.Id);
        Assert.Equal("https://checkout.xendit.co/web/123", result.InvoiceUrl);
    }

    [Fact]
    public async Task CreateInvoiceAsync_ThrowsException_OnFailure()
    {
        // Arrange
        var request = new XenditInvoiceRequest
        {
            ExternalId = "test-123",
            Amount = 1000
        };

        _httpMessageHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.BadRequest,
                Content = new StringContent("{\"error\":\"Invalid request\"}")
            });

        // Act & Assert
        var ex = await Assert.ThrowsAsync<Exception>(() => _sut.CreateInvoiceAsync(request));
        Assert.Contains("Xendit API Error (BadRequest)", ex.Message);
        Assert.Contains("Invalid request", ex.Message);
    }
}
