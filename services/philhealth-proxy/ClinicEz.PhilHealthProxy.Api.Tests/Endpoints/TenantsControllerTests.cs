using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Api.Controllers;
using ClinicEz.PhilHealthProxy.Application.Features.Tenants.Commands;
using ClinicEz.PhilHealthProxy.Application.Features.Tenants.Queries;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
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

    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ITenantRepository _tenantRepo = Substitute.For<ITenantRepository>();
    private readonly IPhilHealthPcapiClient _pcapiClient = Substitute.For<IPhilHealthPcapiClient>();
    private readonly IDataProtectionProvider _dataProtection = new EphemeralDataProtectionProvider();

    [Fact]
    public async Task Configure_WithValidRequest_ReturnsOkObjectResult()
    {
        var env = new FakeHostEnv("Testing");
        var controller = new TenantsController(_mediator, env);

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            BranchId: null,
            FacilityName: "Main Health Center",
            AccreditationNumber: "H91001234",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "KON-DUMMYCERTS-Z15445",
            SecretKey: "secret_123",
            CipherKey: "cipher_key_32_bytes_long_secret!",
            BaseUrl: "https://staging.philhealth.gov.ph",
            IsActive: true);

        var expectedStatus = new TenantConfigurationStatusResponse(
            request.TenantId,
            null,
            request.FacilityName,
            request.AccreditationNumber,
            request.PmccNumber,
            request.SoftwareCertificateId,
            HasSecretKey: true,
            HasCipherKey: true,
            request.BaseUrl!,
            true,
            DateTimeOffset.UtcNow);

        _mediator.Send(Arg.Any<ConfigureTenantCredentialsCommand>(), Arg.Any<CancellationToken>())
            .Returns(expectedStatus);

        var result = await controller.Configure(request, CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>();
        var ok = (OkObjectResult)result;
        var apiRes = (ApiResponse<TenantConfigurationStatusResponse>)ok.Value!;
        apiRes.Succeeded.Should().BeTrue();
        apiRes.Data!.HasSecretKey.Should().BeTrue();
        apiRes.Data.HasCipherKey.Should().BeTrue();
        apiRes.Data.AccreditationNumber.Should().Be("H91001234");
    }

    [Fact]
    public async Task ConfigureCommandHandler_EncryptsSecretAndCipherKeys()
    {
        var handler = new ConfigureTenantCredentialsCommandHandler(_tenantRepo, _dataProtection);

        PhilHealthTenant? capturedTenant = null;
        _tenantRepo.UpsertTenantAsync(Arg.Do<PhilHealthTenant>(t => capturedTenant = t), Arg.Any<CancellationToken>())
            .Returns(ci => Task.FromResult(ci.Arg<PhilHealthTenant>()));

        var request = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            BranchId: null,
            FacilityName: "Downtown Clinic",
            AccreditationNumber: "H10000001",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-001",
            SecretKey: "super_secret_key",
            CipherKey: "super_cipher_key_12345678901234",
            BaseUrl: "https://pcapi.philhealth.gov.ph",
            IsActive: true);

        var response = await handler.Handle(new ConfigureTenantCredentialsCommand(request), CancellationToken.None);

        capturedTenant.Should().NotBeNull();
        capturedTenant!.EncryptedSecretKey.Should().NotBeNullOrEmpty();
        capturedTenant.EncryptedSecretKey.Should().NotBe("super_secret_key"); // Must be protected!
        capturedTenant.EncryptedCipherKey.Should().NotBeNullOrEmpty();
        capturedTenant.EncryptedCipherKey.Should().NotBe("super_cipher_key_12345678901234"); // Must be protected!

        response.HasSecretKey.Should().BeTrue();
        response.HasCipherKey.Should().BeTrue();
    }

    [Fact]
    public void ConfigureCommandValidator_RejectsInvalidAccreditationNumber()
    {
        var validator = new ConfigureTenantCredentialsCommandValidator();

        var invalidAccre = new ConfigureTenantCredentialsRequest(
            TenantId: Guid.NewGuid(),
            BranchId: null,
            FacilityName: "Clinic",
            AccreditationNumber: "SHORT", // not 9 chars
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT",
            SecretKey: "secret",
            CipherKey: "cipher");

        var result = validator.Validate(new ConfigureTenantCredentialsCommand(invalidAccre));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName.Contains("AccreditationNumber"));
    }

    [Fact]
    public async Task GetStatus_ReturnsConfiguredStatus_WhenTenantExists()
    {
        var tenantId = Guid.NewGuid();
        var handler = new GetTenantStatusQueryHandler(_tenantRepo);

        _tenantRepo.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>())
            .Returns(new PhilHealthTenant
            {
                TenantId = tenantId,
                FacilityName = "St. Jude Clinic",
                AccreditationNumber = "H91001234",
                PmccNumber = "Z15445",
                SoftwareCertificateId = "CERT-123",
                EncryptedSecretKey = "encrypted_secret",
                EncryptedCipherKey = "encrypted_cipher",
                BaseUrl = "https://pcapi.philhealth.gov.ph",
                IsActive = true
            });

        var result = await handler.Handle(new GetTenantStatusQuery(tenantId), CancellationToken.None);

        result.FacilityName.Should().Be("St. Jude Clinic");
        result.AccreditationNumber.Should().Be("H91001234");
        result.HasSecretKey.Should().BeTrue();
        result.HasCipherKey.Should().BeTrue();
        result.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task GetStatus_ReturnsUnconfiguredStatus_WhenTenantDoesNotExist()
    {
        var tenantId = Guid.NewGuid();
        var handler = new GetTenantStatusQueryHandler(_tenantRepo);

        _tenantRepo.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>())
            .Returns((PhilHealthTenant?)null);

        var result = await handler.Handle(new GetTenantStatusQuery(tenantId), CancellationToken.None);

        result.HasSecretKey.Should().BeFalse();
        result.HasCipherKey.Should().BeFalse();
        result.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task TestConnection_ReturnsSuccess_WhenAuthenticationSucceeds()
    {
        var tenantId = Guid.NewGuid();
        var tenant = new PhilHealthTenant
        {
            TenantId = tenantId,
            AccreditationNumber = "H10000001",
            SoftwareCertificateId = "CERT-001",
            EncryptedSecretKey = "enc_secret",
            EncryptedCipherKey = "enc_cipher",
            BaseUrl = "https://staging.philhealth.gov.ph"
        };

        _tenantRepo.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>())
            .Returns(tenant);

        _pcapiClient.AuthenticateAsync(tenant, Arg.Any<CancellationToken>())
            .Returns(new PcapiTokenData("TOKEN_OK", "Bearer", 3600));

        var handler = new TestTenantConnectionCommandHandler(_tenantRepo, _pcapiClient);
        var result = await handler.Handle(new TestTenantConnectionCommand(tenantId), CancellationToken.None);

        result.Success.Should().BeTrue();
        result.StatusCode.Should().Be(200);
        result.Message.Should().Contain("Successfully authenticated");
    }

    [Fact]
    public async Task TestConnection_ReturnsNotFound_WhenTenantNotConfigured()
    {
        var tenantId = Guid.NewGuid();
        _tenantRepo.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>())
            .Returns((PhilHealthTenant?)null);

        var handler = new TestTenantConnectionCommandHandler(_tenantRepo, _pcapiClient);
        var result = await handler.Handle(new TestTenantConnectionCommand(tenantId), CancellationToken.None);

        result.Success.Should().BeFalse();
        result.StatusCode.Should().Be(404);
        result.Message.Should().Contain("Tenant credentials not configured");
    }
}
