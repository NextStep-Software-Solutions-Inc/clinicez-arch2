using Clinic EZ.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using PhilHealthProxy.Application.Features.Atc.Queries.IsAtcValid;
using PhilHealthProxy.Domain.Interfaces;
using PhilHealthProxy.Domain.Models;
using Xunit;

namespace PhilHealthProxy.Application.Tests.Handlers;

public sealed class IsAtcValidQueryHandlerTests
{
    private readonly IPhilHealthSoapClient _soap = Substitute.For<IPhilHealthSoapClient>();
    private readonly ICurrentTenant _tenant = Substitute.For<ICurrentTenant>();
    private readonly IsAtcValidQueryHandler _sut;

    public IsAtcValidQueryHandlerTests()
    {
        _sut = new IsAtcValidQueryHandler(_soap, _tenant);
    }

    private static IsAtcValidQuery ValidQuery =>
        new() { Pin = "01-234567890-0", Atc = "ATC-001", EffectivityDate = "2025-06-01" };

    [Fact]
    public async Task Returns_success_when_SOAP_succeeds()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.IsAtcValidAsync(
                Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>VALID</return>", null, null));

        var result = await _sut.Handle(ValidQuery, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.RawReturn.Should().Be("<return>VALID</return>");
    }

    [Fact]
    public async Task Throws_UnauthorizedException_when_tenant_is_null()
    {
        _tenant.TenantId.Returns((Guid?)null);

        await Assert.ThrowsAsync<UnauthorizedException>(
            () => _sut.Handle(ValidQuery, CancellationToken.None));
    }

    [Fact]
    public async Task Throws_ServiceUnavailableException_when_SOAP_fails()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.IsAtcValidAsync(
                Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "INVALID_ATC", "ATC not found."));

        await Assert.ThrowsAsync<ServiceUnavailableException>(
            () => _sut.Handle(ValidQuery, CancellationToken.None));
    }
}
