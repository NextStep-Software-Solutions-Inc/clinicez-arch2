using Clinic EZ.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using PhilHealthProxy.Application.Features.Members.Queries.IsMemberDependentRegistered;
using PhilHealthProxy.Domain.Interfaces;
using PhilHealthProxy.Domain.Models;
using Xunit;

namespace PhilHealthProxy.Application.Tests.Handlers;

public sealed class IsMemberDependentRegisteredQueryHandlerTests
{
    private readonly IPhilHealthSoapClient _soap = Substitute.For<IPhilHealthSoapClient>();
    private readonly ICurrentTenant _tenant = Substitute.For<ICurrentTenant>();
    private readonly IsMemberDependentRegisteredQueryHandler _sut;

    public IsMemberDependentRegisteredQueryHandlerTests()
    {
        _sut = new IsMemberDependentRegisteredQueryHandler(_soap, _tenant);
    }

    private static IsMemberDependentRegisteredQuery ValidQuery =>
        new() { Pin = "01-234567890-0", Type = "M" };

    [Fact]
    public async Task Returns_success_when_SOAP_succeeds()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.IsMemberDependentRegisteredAsync(
                Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>true</return>", null, null));

        var result = await _sut.Handle(ValidQuery, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.RawReturn.Should().Be("<return>true</return>");
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
        _soap.IsMemberDependentRegisteredAsync(
                Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "SOAP_FAULT", "Unexpected fault."));

        await Assert.ThrowsAsync<ServiceUnavailableException>(
            () => _sut.Handle(ValidQuery, CancellationToken.None));
    }

    [Fact]
    public async Task Forwards_pin_and_type_to_SOAP_client()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.IsMemberDependentRegisteredAsync(
                Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return/>", null, null));

        await _sut.Handle(new IsMemberDependentRegisteredQuery { Pin = "PIN-123", Type = "D" }, CancellationToken.None);

        await _soap.Received(1).IsMemberDependentRegisteredAsync("PIN-123", "D", Arg.Any<CancellationToken>());
    }
}
