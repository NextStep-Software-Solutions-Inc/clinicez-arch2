using CLINICEZ.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using PhilHealthProxy.Application.Features.Token.Queries.GetToken;
using PhilHealthProxy.Domain.Interfaces;
using PhilHealthProxy.Domain.Models;
using Xunit;

namespace PhilHealthProxy.Application.Tests.Handlers;

public sealed class GetTokenQueryHandlerTests
{
    private readonly IPhilHealthSoapClient _soap = Substitute.For<IPhilHealthSoapClient>();
    private readonly ICurrentTenant _tenant = Substitute.For<ICurrentTenant>();
    private readonly GetTokenQueryHandler _sut;

    public GetTokenQueryHandlerTests()
    {
        _sut = new GetTokenQueryHandler(_soap, _tenant);
    }

    [Fact]
    public async Task Returns_success_response_when_SOAP_succeeds()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.GetTokenAsync(Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>TOKEN123</return>", null, null));

        var result = await _sut.Handle(new GetTokenQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.IsSuccess.Should().BeTrue();
        result.Data.RawReturn.Should().Be("<return>TOKEN123</return>");
    }

    [Fact]
    public async Task Throws_UnauthorizedException_when_tenant_is_null()
    {
        _tenant.TenantId.Returns((Guid?)null);

        await Assert.ThrowsAsync<UnauthorizedException>(
            () => _sut.Handle(new GetTokenQuery(), CancellationToken.None));
    }

    [Fact]
    public async Task Throws_ServiceUnavailableException_when_SOAP_fails()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.GetTokenAsync(Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "AUTH_FAILED", "Invalid credentials."));

        await Assert.ThrowsAsync<ServiceUnavailableException>(
            () => _sut.Handle(new GetTokenQuery(), CancellationToken.None));
    }
}
