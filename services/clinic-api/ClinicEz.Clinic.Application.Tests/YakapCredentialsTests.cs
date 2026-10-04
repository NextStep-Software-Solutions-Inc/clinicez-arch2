using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;


namespace ClinicEz.Clinic.Application.Tests;

public sealed class YakapCredentialsTests
{
    private class MockHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handlerFunc) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(handlerFunc(request));
        }
    }

    private static PhilHealthProxyClient CreateClient(Func<HttpRequestMessage, HttpResponseMessage> handler)
    {
        var httpClient = new HttpClient(new MockHttpMessageHandler(handler))
        {
            BaseAddress = new Uri("http://localhost:5025")
        };

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["PhilHealthProxy:BaseUrl"] = "http://localhost:5025"
            })
            .Build();

        return new PhilHealthProxyClient(httpClient, config, NullLogger<PhilHealthProxyClient>.Instance);
    }

    [Fact]
    public async Task ConfigureTenantCredentialsAsync_SendsCorrectPayload_ReturnsSuccess()
    {
        var tenantId = Guid.NewGuid();
        var client = CreateClient(req =>
        {
            req.Method.Should().Be(HttpMethod.Post);
            req.RequestUri!.PathAndQuery.Should().Be("/api/tenants/configure");

            var statusResponse = new PhilHealthConfigStatusResponse(
                TenantId: tenantId,
                FacilityName: "St. Jude Clinic",
                AccreditationNumber: "PHIC-99999",
                PmccNumber: "PMCC-12345",
                SoftwareCertificateId: "CERT-ABCDE",
                KonsultaEndpoint: "/soap/konsulta",
                IsConfigured: true,
                IsActive: true,
                UpdatedAt: DateTimeOffset.UtcNow);

            var apiResp = ApiResponse<PhilHealthConfigStatusResponse>.Success(statusResponse);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(apiResp), System.Text.Encoding.UTF8, "application/json")
            };
        });

        var request = new ConfigurePhilHealthCredentialsProxyRequest(
            TenantId: tenantId,
            FacilityName: "St. Jude Clinic",
            AccreditationNumber: "PHIC-99999",
            PmccNumber: "PMCC-12345",
            SoftwareCertificateId: "CERT-ABCDE",
            Username: "phic_user",
            Password: "secret_password",
            CipherKey: "secret_cipher_key",
            KonsultaEndpoint: "/soap/konsulta");

        var response = await client.ConfigureTenantCredentialsAsync(request);

        response.Succeeded.Should().BeTrue();
        response.Data.Should().NotBeNull();
        response.Data!.IsConfigured.Should().BeTrue();
        response.Data.AccreditationNumber.Should().Be("PHIC-99999");
    }

    [Fact]
    public async Task GetTenantConfigurationStatusAsync_ReturnsStatusFromProxy()
    {
        var tenantId = Guid.NewGuid();
        var client = CreateClient(req =>
        {
            req.Method.Should().Be(HttpMethod.Get);
            req.RequestUri!.PathAndQuery.Should().Contain($"/api/tenants/status?tenantId={tenantId}");

            var statusResponse = new PhilHealthConfigStatusResponse(
                TenantId: tenantId,
                FacilityName: "St. Jude Clinic",
                AccreditationNumber: "PHIC-99999",
                PmccNumber: "PMCC-12345",
                SoftwareCertificateId: "CERT-ABCDE",
                KonsultaEndpoint: "/soap/konsulta",
                IsConfigured: true,
                IsActive: true,
                UpdatedAt: DateTimeOffset.UtcNow);

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(ApiResponse<PhilHealthConfigStatusResponse>.Success(statusResponse)), System.Text.Encoding.UTF8, "application/json")
            };
        });

        var response = await client.GetTenantConfigurationStatusAsync(tenantId);

        response.Succeeded.Should().BeTrue();
        response.Data!.IsConfigured.Should().BeTrue();
        response.Data.FacilityName.Should().Be("St. Jude Clinic");
    }

    [Fact]
    public async Task TestTenantConnectionAsync_WhenGatewayAccepts_ReturnsSuccessMessage()
    {
        var tenantId = Guid.NewGuid();
        var client = CreateClient(req =>
        {
            req.Method.Should().Be(HttpMethod.Post);
            req.RequestUri!.PathAndQuery.Should().Contain($"/api/tenants/test-connection?tenantId={tenantId}");

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(ApiResponse<string>.Success("Authentication successful! PhilHealth gateway accepted facility credentials.")),
                    System.Text.Encoding.UTF8,
                    "application/json")
            };
        });

        var response = await client.TestTenantConnectionAsync(tenantId);

        response.Succeeded.Should().BeTrue();
        response.Data.Should().Contain("Authentication successful");
    }

    [Fact]
    public async Task ConfigureTenantCredentialsAsync_WhenHttpError_ReturnsFailure()
    {
        var tenantId = Guid.NewGuid();
        var client = CreateClient(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("Server Error")
        });

        var request = new ConfigurePhilHealthCredentialsProxyRequest(
            TenantId: tenantId,
            FacilityName: "Fail Clinic",
            AccreditationNumber: "PHIC-00000",
            PmccNumber: "",
            SoftwareCertificateId: "",
            Username: "user",
            Password: "pwd",
            CipherKey: "key");

        var response = await client.ConfigureTenantCredentialsAsync(request);

        response.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task TestTenantConnectionAsync_WhenGatewayRejects_ReturnsFailure()
    {
        var tenantId = Guid.NewGuid();
        var client = CreateClient(_ =>
        {
            var apiResp = ApiResponse<string>.Fail("Invalid facility accreditation code or expired certificate.");
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(apiResp), System.Text.Encoding.UTF8, "application/json")
            };
        });

        var response = await client.TestTenantConnectionAsync(tenantId);

        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("Invalid facility accreditation code");
    }
}


