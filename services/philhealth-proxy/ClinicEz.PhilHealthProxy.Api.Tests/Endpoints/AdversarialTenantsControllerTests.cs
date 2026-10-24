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

public sealed class AdversarialTenantsControllerTests
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

    [Theory]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/?target=staging.philhealth.gov.ph")]
    [InlineData("https://konsulta.philhealth.gov.ph/staging.philhealth.gov.ph/SOAP/")]
    [InlineData("https://notstaging.philhealth.gov.ph/soap/")]
    [InlineData("https://teststaging.philhealth.gov.ph/soap/")]
    public async Task Configure_WithQueryOrPathContainingStagingPhilHealthGovPh_InProductionEnv_MustReturnBadRequest(
        string adversarialProductionEndpoint)
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
            KonsultaEndpoint: adversarialProductionEndpoint);

        _tenantRepository.UpsertTenantAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(ci => Task.FromResult(ci.Arg<PhilHealthTenant>()));

        var result = await controller.ConfigureCredentials(request, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
        var badRequest = (BadRequestObjectResult)result;
        var response = (ApiResponse<TenantConfigurationStatusResponse>)badRequest.Value!;
        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("Accreditation number, username, and password are required.");

        await _tenantRepository.DidNotReceiveWithAnyArgs().UpsertTenantAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>());
    }
}
