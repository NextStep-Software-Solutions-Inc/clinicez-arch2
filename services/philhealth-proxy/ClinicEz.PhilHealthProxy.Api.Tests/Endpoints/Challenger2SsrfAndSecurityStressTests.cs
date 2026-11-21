using System;
using System.Net;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Api.Controllers;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using ClinicEz.PhilHealthProxy.Application.Features.Tenants.Commands;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class Challenger2SsrfAndSecurityStressTests
{
    private sealed class FakeHostEnv(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.PhilHealthProxy";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private readonly IMediator _mediator = Substitute.For<IMediator>();

    #region 1. Mandatory Orchestrator SSRF Attack Vectors (Unit Level in Production Env)

    [Theory]
    [InlineData("http://169.254.169.254/latest/meta-data/")]
    [InlineData("http://127.0.0.1:8080")]
    [InlineData("http://localhost")]
    [InlineData("http://10.0.0.1")]
    [InlineData("ftp://evil.com")]
    public async Task Configure_WithMandatoryAdversarialSsrfVectors_InProduction_MustReturnBadRequest_AndNeverDispatch(
        string maliciousBaseUrl)
    {
        // Arrange
        var env = new FakeHostEnv("Production");
        var controller = new TenantsController(_mediator, env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            BranchId: null,
            FacilityName: "Malicious Attack Facility",
            AccreditationNumber: "H91001234",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-SSRF-ATTACK",
            SecretKey: "supersecret",
            CipherKey: "supercipher123456789012345678901",
            BaseUrl: maliciousBaseUrl);

        // Act
        var result = await controller.Configure(request, CancellationToken.None);

        // Assert
        result.Should().BeOfType<BadRequestObjectResult>();
        var badRequest = (BadRequestObjectResult)result;
        badRequest.StatusCode.Should().Be(400);

        var response = (ApiResponse<TenantConfigurationStatusResponse>)badRequest.Value!;
        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("SSRF security policy");

        // Verify Mediator was never invoked (command was rejected before any dispatch or network call)
        await _mediator.DidNotReceiveWithAnyArgs().Send(Arg.Any<ConfigureTenantCredentialsCommand>(), Arg.Any<CancellationToken>());
    }

    #endregion

    #region 2. Mandatory SSRF Attack Vectors with Null/Default Environment

    [Theory]
    [InlineData("http://169.254.169.254/latest/meta-data/")]
    [InlineData("http://10.0.0.1")]
    [InlineData("ftp://evil.com")]
    [InlineData("http://127.0.0.1:8080")]
    [InlineData("http://localhost")]
    public async Task Configure_WithMaliciousSsrfVectors_WhenEnvIsNull_MustReturnBadRequest_AndNeverDispatch(
        string maliciousBaseUrl)
    {
        // Arrange: Test when environment parameter is null (safe default posture)
        var controller = new TenantsController(_mediator, environment: null);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            BranchId: null,
            FacilityName: "Malicious Attack Facility",
            AccreditationNumber: "H91001234",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-SSRF-ATTACK",
            SecretKey: "supersecret",
            CipherKey: "supercipher123456789012345678901",
            BaseUrl: maliciousBaseUrl);

        // Act
        var result = await controller.Configure(request, CancellationToken.None);

        // Assert
        result.Should().BeOfType<BadRequestObjectResult>();
        var badRequest = (BadRequestObjectResult)result;
        badRequest.StatusCode.Should().Be(400);

        var response = (ApiResponse<TenantConfigurationStatusResponse>)badRequest.Value!;
        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("SSRF security policy");

        await _mediator.DidNotReceiveWithAnyArgs().Send(Arg.Any<ConfigureTenantCredentialsCommand>(), Arg.Any<CancellationToken>());
    }

    #endregion

    #region 3. Extended Adversarial Attack Vectors (Private Subnets, IPv6, Scheme Injection)

    [Theory]
    [InlineData("http://172.16.0.1/status")]
    [InlineData("http://172.31.255.255/internal")]
    [InlineData("http://192.168.0.1:8443")]
    [InlineData("http://192.168.1.254")]
    [InlineData("gopher://pcapi.philhealth.gov.ph")]
    [InlineData("file:///etc/passwd")]
    [InlineData("ldap://pcapi.philhealth.gov.ph")]
    [InlineData("https://philhealth.gov.ph.attacker-owned.com/api")]
    [InlineData("https://attacker-philhealth.gov.ph/pcapi")]
    [InlineData("http://pcapi.philhealth.gov.ph")] // HTTP unencrypted in Production
    public async Task Configure_WithExtendedAdversarialVectors_InProduction_MustBeRejected(
        string maliciousBaseUrl)
    {
        var env = new FakeHostEnv("Production");
        var controller = new TenantsController(_mediator, env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            BranchId: null,
            FacilityName: "Penetration Test",
            AccreditationNumber: "H91001234",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-PEN-TEST",
            SecretKey: "supersecret",
            CipherKey: "supercipher123456789012345678901",
            BaseUrl: maliciousBaseUrl);

        var result = await controller.Configure(request, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
        var badRequest = (BadRequestObjectResult)result;
        var response = (ApiResponse<TenantConfigurationStatusResponse>)badRequest.Value!;
        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("SSRF security policy");

        await _mediator.DidNotReceiveWithAnyArgs().Send(Arg.Any<ConfigureTenantCredentialsCommand>(), Arg.Any<CancellationToken>());
    }

    #endregion

    #region 4. Integration-Level SSRF Guard Verification via WebApplicationFactory

    private sealed class ProductionPhilHealthProxyFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("Internal:ApiKey", "test-internal-key");
            builder.UseSetting("PortalApi:BaseUrl", "https://pcapi.philhealth.gov.ph");
            builder.UseSetting("Messaging:Transport", "InProcess");
            builder.UseSetting("Messaging:Enabled", "false");

            builder.ConfigureServices(services =>
            {
                var pcapiDesc = services.FirstOrDefault(d => d.ServiceType == typeof(IPhilHealthPcapiClient));
                if (pcapiDesc != null) services.Remove(pcapiDesc);
                services.AddSingleton(Substitute.For<IPhilHealthPcapiClient>());

                var tenantDesc = services.FirstOrDefault(d => d.ServiceType == typeof(ITenantRepository));
                if (tenantDesc != null) services.Remove(tenantDesc);
                services.AddSingleton(Substitute.For<ITenantRepository>());
            });
        }
    }

    [Theory]
    [InlineData("http://169.254.169.254/latest/meta-data/")]
    [InlineData("http://127.0.0.1:8080")]
    [InlineData("http://localhost")]
    [InlineData("http://10.0.0.1")]
    [InlineData("ftp://evil.com")]
    public async Task Integration_PostTenantsConfigure_WithMaliciousSsrfUrl_ReturnsHttp400BadRequest(
        string maliciousBaseUrl)
    {
        // Arrange
        await using var factory = new ProductionPhilHealthProxyFactory();
        var client = factory.CreateClient();

        var payload = new
        {
            tenantId = Guid.NewGuid(),
            branchId = (Guid?)null,
            facilityName = "SSRF Attack Clinic",
            accreditationNumber = "H91001234",
            pmccNumber = "Z15445",
            softwareCertificateId = "CERT-SSRF",
            secretKey = "supersecret",
            cipherKey = "supercipher123456789012345678901",
            baseUrl = maliciousBaseUrl
        };

        // Act
        var response = await client.PostAsJsonAsync("/api/tenants", payload);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("SSRF security policy");
    }

    #endregion
}
