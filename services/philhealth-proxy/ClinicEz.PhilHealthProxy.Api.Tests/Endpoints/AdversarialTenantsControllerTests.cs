using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Api.Controllers;
using ClinicEz.PhilHealthProxy.Application.Features.Tenants.Commands;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class AdversarialTenantsControllerTests
{
    private sealed class FakeHostEnv(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.PhilHealthProxy";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private readonly IMediator _mediator = Substitute.For<IMediator>();

    [Theory]
    [InlineData("http://169.254.169.254/latest/meta-data")]
    [InlineData("http://10.0.0.1/admin")]
    [InlineData("http://192.168.1.1:8080")]
    [InlineData("http://172.16.0.1/internal")]
    [InlineData("https://attacker-philhealth.gov.ph/pcapi")]
    [InlineData("https://philhealth.gov.ph.attacker.com/api")]
    [InlineData("https://evil.com/api")]
    [InlineData("ftp://staging.philhealth.gov.ph")]
    [InlineData("http://staging.philhealth.gov.ph")] // Non-HTTPS in production
    [InlineData("http://localhost:8080")] // Localhost in production
    public async Task Configure_WithAdversarialOrPrivateUrl_InProductionEnv_MustReturnBadRequest_AndNeverDispatch(
        string adversarialEndpoint)
    {
        var env = new FakeHostEnv("Production");
        var controller = new TenantsController(_mediator, env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            BranchId: null,
            FacilityName: "Attacker Clinic",
            AccreditationNumber: "H91001234",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-PROD",
            SecretKey: "secret",
            CipherKey: "cipher",
            BaseUrl: adversarialEndpoint);

        var result = await controller.Configure(request, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
        var badRequest = (BadRequestObjectResult)result;
        var response = (ApiResponse<TenantConfigurationStatusResponse>)badRequest.Value!;
        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("SSRF security policy");

        await _mediator.DidNotReceiveWithAnyArgs().Send(Arg.Any<ConfigureTenantCredentialsCommand>(), Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("https://staging.philhealth.gov.ph")]
    [InlineData("https://pcapi.philhealth.gov.ph")]
    [InlineData("https://pcapi-staging.philhealth.gov.ph")]
    [InlineData("https://cloud.philhealth.gov.ph")]
    public async Task Configure_WithLegitimatePhilHealthUrl_InProductionEnv_PassesSsrfGuard_AndDispatches(
        string validEndpoint)
    {
        var env = new FakeHostEnv("Production");
        var controller = new TenantsController(_mediator, env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            BranchId: null,
            FacilityName: "Legit Clinic",
            AccreditationNumber: "H91001234",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-PROD",
            SecretKey: "secret",
            CipherKey: "cipher",
            BaseUrl: validEndpoint);

        _mediator.Send(Arg.Any<ConfigureTenantCredentialsCommand>(), Arg.Any<CancellationToken>())
            .Returns(new TenantConfigurationStatusResponse(
                request.TenantId,
                null,
                request.FacilityName,
                request.AccreditationNumber,
                request.PmccNumber,
                request.SoftwareCertificateId,
                HasSecretKey: true,
                HasCipherKey: true,
                validEndpoint,
                true,
                DateTimeOffset.UtcNow));

        var result = await controller.Configure(request, CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>();
        await _mediator.Received(1).Send(Arg.Any<ConfigureTenantCredentialsCommand>(), Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("http://localhost:5000")]
    [InlineData("http://127.0.0.1:8080")]
    [InlineData("http://pcapi-simulator:8080")]
    [InlineData("https://sandbox.philhealth.gov.ph")]
    public async Task Configure_WithLocalhostOrSimulator_InTestingEnvironment_PassesSsrfGuard(
        string devEndpoint)
    {
        var env = new FakeHostEnv("Testing");
        var controller = new TenantsController(_mediator, env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            BranchId: null,
            FacilityName: "Dev Clinic",
            AccreditationNumber: "H91001234",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-DEV",
            SecretKey: "secret",
            CipherKey: "cipher",
            BaseUrl: devEndpoint);

        _mediator.Send(Arg.Any<ConfigureTenantCredentialsCommand>(), Arg.Any<CancellationToken>())
            .Returns(new TenantConfigurationStatusResponse(
                request.TenantId,
                null,
                request.FacilityName,
                request.AccreditationNumber,
                request.PmccNumber,
                request.SoftwareCertificateId,
                HasSecretKey: true,
                HasCipherKey: true,
                devEndpoint,
                true,
                DateTimeOffset.UtcNow));

        var result = await controller.Configure(request, CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>();
    }
}
