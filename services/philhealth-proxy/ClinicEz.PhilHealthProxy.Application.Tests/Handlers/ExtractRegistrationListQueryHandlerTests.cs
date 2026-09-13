using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using ClinicEz.PhilHealthProxy.Application.Features.Registration.Queries.ExtractRegistrationList;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Handlers;

public sealed class ExtractRegistrationListQueryHandlerTests
{
    private readonly IPhilHealthSoapClient _soap = Substitute.For<IPhilHealthSoapClient>();
    private readonly ICurrentTenant _tenant = Substitute.For<ICurrentTenant>();
    private readonly ExtractRegistrationListQueryHandler _sut;

    public ExtractRegistrationListQueryHandlerTests()
    {
        _sut = new ExtractRegistrationListQueryHandler(_soap, _tenant);
    }

    private static ExtractRegistrationListQuery ValidQuery =>
        new() { StartDate = "2025-01-01", EndDate = "2025-01-31" };

    [Fact]
    public async Task Returns_success_when_SOAP_succeeds()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.ExtractRegistrationListAsync(
                Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return><list/></return>", null, null));

        var result = await _sut.Handle(ValidQuery, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.RawReturn.Should().NotBeNullOrEmpty();
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
        _soap.ExtractRegistrationListAsync(
                Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "TRANSPORT_ERROR", "Network error."));

        await Assert.ThrowsAsync<ServiceUnavailableException>(
            () => _sut.Handle(ValidQuery, CancellationToken.None));
    }
}
