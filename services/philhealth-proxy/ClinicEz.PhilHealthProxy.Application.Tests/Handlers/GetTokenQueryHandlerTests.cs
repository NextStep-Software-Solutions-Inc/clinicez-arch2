using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.Token.Commands.AuthenticateToken;
using ClinicEz.PhilHealthProxy.Application.Features.Token.Queries.GetToken;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Handlers;

public sealed class GetTokenQueryHandlerTests
{
    private readonly ICurrentTenant _tenant = Substitute.For<ICurrentTenant>();
    private readonly ITenantRepository _tenantRepo = Substitute.For<ITenantRepository>();
    private readonly IPhilHealthPcapiClient _pcapi = Substitute.For<IPhilHealthPcapiClient>();
    private readonly GetTokenQueryHandler _sut;

    public GetTokenQueryHandlerTests()
    {
        _sut = new GetTokenQueryHandler(_tenant, _tenantRepo, _pcapi);
    }

    [Fact]
    public async Task Returns_success_response_when_PCAPI_succeeds()
    {
        var tenantId = Guid.NewGuid();
        _tenant.TenantId.Returns(tenantId);
        _tenantRepo.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>())
            .Returns(new PhilHealthTenant
            {
                TenantId = tenantId,
                AccreditationNumber = "H10000001",
                SoftwareCertificateId = "CERT-123",
                BaseUrl = "https://staging.philhealth.gov.ph"
            });

        _pcapi.AuthenticateAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new PcapiTokenData("TOKEN123", "Bearer", 3600));

        var result = await _sut.Handle(new GetTokenQuery(), CancellationToken.None);

        result.Status.Should().Be("success");
        result.Code.Should().Be(200);
        result.Data.Should().NotBeNull();
        result.Data!.AccessToken.Should().Be("TOKEN123");
        result.Data.TokenType.Should().Be("Bearer");
        result.Data.ExpiresIn.Should().Be(3600);
    }

    [Fact]
    public async Task Throws_UnauthorizedAccessException_when_tenant_is_null()
    {
        _tenant.TenantId.Returns((Guid?)null);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(
            () => _sut.Handle(new GetTokenQuery(), CancellationToken.None));
    }

    [Fact]
    public async Task AuthenticateTokenCommandHandler_authenticates_direct_credentials()
    {
        var handler = new AuthenticateTokenCommandHandler(_pcapi);
        _pcapi.AuthenticateAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new PcapiTokenData("TOKEN_AUTH_DIRECT", "Bearer", 3600));

        var req = new PcapiTokenRequest("CERT-456", "H91001234", "secret_key_123");
        var result = await handler.Handle(new AuthenticateTokenCommand(req), CancellationToken.None);

        result.Status.Should().Be("success");
        result.Code.Should().Be(200);
        result.Data!.AccessToken.Should().Be("TOKEN_AUTH_DIRECT");
    }
}
