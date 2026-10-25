using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Api.Controllers;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class TenantsControllerTests
{
    private sealed class FakeHostEnv(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.PhilHealthProxy";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private readonly ITenantRepository _tenantRepository = Substitute.For<ITenantRepository>();
    private readonly IPhilHealthSoapClient _soapClient = Substitute.For<IPhilHealthSoapClient>();
    private readonly IDataProtectionProvider _dataProtection = new EphemeralDataProtectionProvider();

    [Fact]
    public async Task Configure_WithBlankCredentialsOnStagingEndpoint_ReturnsOk()
    {
        var env = new FakeHostEnv("Production");
        var controller = new TenantsController(
            _tenantRepository,
            _soapClient,
            _dataProtection,
            NullLogger<TenantsController>.Instance,
            env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            FacilityName: "Staging Clinic",
            AccreditationNumber: "P10038831",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "KON-DUMMYCERTS-Z15445",
            Username: "",
            Password: "",
            CipherKey: "",
            KonsultaEndpoint: "https://staging.philhealth.gov.ph/KONSULTA/SOAP");

        _tenantRepository.UpsertTenantAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(ci => Task.FromResult(ci.Arg<PhilHealthTenant>()));

        var result = await controller.ConfigureCredentials(request, CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>();
        var okResult = (OkObjectResult)result;
        var response = (ApiResponse<TenantConfigurationStatusResponse>)okResult.Value!;
        response.Succeeded.Should().BeTrue();
        response.Data!.IsConfigured.Should().BeTrue();
    }

    [Theory]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/")]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP")]
    [InlineData("https://claims.philhealth.gov.ph/soap/gateway")]
    [InlineData("https://claims.philhealth.gov.ph/soap/gateway/")]
    [InlineData("https://prod.philhealth.gov.ph/KONSULTA/SOAP/")]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/   ")]
    public async Task Configure_WithBlankCredentialsOnProductionEndpointVariantsInProductionEnv_ReturnsBadRequest(
        string productionEndpoint)
    {
        var env = new FakeHostEnv("Production");
        var controller = new TenantsController(
            _tenantRepository,
            _soapClient,
            _dataProtection,
            NullLogger<TenantsController>.Instance,
            env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            FacilityName: "Production Clinic",
            AccreditationNumber: "H91001234",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-PROD",
            Username: "",
            Password: "",
            CipherKey: "",
            KonsultaEndpoint: productionEndpoint);

        var result = await controller.ConfigureCredentials(request, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
        var badRequest = (BadRequestObjectResult)result;
        var response = (ApiResponse<TenantConfigurationStatusResponse>)badRequest.Value!;
        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("Accreditation number, username, and password are required.");

        await _tenantRepository.DidNotReceiveWithAnyArgs().UpsertTenantAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("https://staging.philhealth.gov.ph/KONSULTA/SOAP/")]
    [InlineData("https://staging.philhealth.gov.ph/KONSULTA/SOAP")]
    [InlineData("https://staging.philhealth.gov.ph/soap/")]
    [InlineData("/soap/konsulta/")]
    [InlineData("/soap/konsulta")]
    public async Task Configure_WithBlankCredentialsOnStagingEndpointVariants_InProductionEnv_ReturnsOk(
        string stagingEndpoint)
    {
        var env = new FakeHostEnv("Production");
        var controller = new TenantsController(
            _tenantRepository,
            _soapClient,
            _dataProtection,
            NullLogger<TenantsController>.Instance,
            env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            FacilityName: "Staging Clinic",
            AccreditationNumber: "P10038831",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "KON-DUMMYCERTS-Z15445",
            Username: "",
            Password: "",
            CipherKey: "",
            KonsultaEndpoint: stagingEndpoint);

        _tenantRepository.UpsertTenantAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(ci => Task.FromResult(ci.Arg<PhilHealthTenant>()));

        var result = await controller.ConfigureCredentials(request, CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>();
        var okResult = (OkObjectResult)result;
        var response = (ApiResponse<TenantConfigurationStatusResponse>)okResult.Value!;
        response.Succeeded.Should().BeTrue();
        response.Data!.IsConfigured.Should().BeTrue();
    }

    [Fact]
    public async Task Configure_TrimsKonsultaEndpoint_BeforePersistingToTenant()
    {
        var env = new FakeHostEnv("Development");
        var controller = new TenantsController(
            _tenantRepository,
            _soapClient,
            _dataProtection,
            NullLogger<TenantsController>.Instance,
            env);

        PhilHealthTenant? capturedTenant = null;
        _tenantRepository.UpsertTenantAsync(Arg.Do<PhilHealthTenant>(t => capturedTenant = t), Arg.Any<CancellationToken>())
            .Returns(ci => Task.FromResult(ci.Arg<PhilHealthTenant>()));

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            FacilityName: "Trimming Test Clinic",
            AccreditationNumber: "P10038831",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "KON-DUMMYCERTS-Z15445",
            Username: "",
            Password: "",
            CipherKey: "",
            KonsultaEndpoint: "   https://staging.philhealth.gov.ph/KONSULTA/SOAP/   ");

        var result = await controller.ConfigureCredentials(request, CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>();
        capturedTenant.Should().NotBeNull();
        capturedTenant!.KonsultaEndpoint.Should().Be("https://staging.philhealth.gov.ph/KONSULTA/SOAP/");
    }

    [Fact]
    public async Task Configure_WithBlankCredentialsInDevelopmentEnvironment_ReturnsOk()
    {
        var env = new FakeHostEnv("Development");
        var controller = new TenantsController(
            _tenantRepository,
            _soapClient,
            _dataProtection,
            NullLogger<TenantsController>.Instance,
            env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            FacilityName: "Dev Clinic",
            AccreditationNumber: "P10038831",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-DEV",
            Username: "",
            Password: "",
            CipherKey: "",
            KonsultaEndpoint: "https://konsulta.philhealth.gov.ph/KONSULTA/SOAP");

        _tenantRepository.UpsertTenantAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(ci => Task.FromResult(ci.Arg<PhilHealthTenant>()));

        var result = await controller.ConfigureCredentials(request, CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task Configure_WithMissingAccreditationNumber_ReturnsBadRequest()
    {
        var controller = new TenantsController(
            _tenantRepository,
            _soapClient,
            _dataProtection,
            NullLogger<TenantsController>.Instance);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            FacilityName: "Dev Clinic",
            AccreditationNumber: "",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-DEV",
            Username: "user",
            Password: "pwd",
            CipherKey: "");

        var result = await controller.ConfigureCredentials(request, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
    }
}
