using CLINICEZ.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;
using PhilHealthProxy.Domain.Interfaces;
using PhilHealthProxy.Domain.Models;
using Xunit;

namespace PhilHealthProxy.Application.Tests.Handlers;

public sealed class CheckUploadStatusQueryHandlerTests
{
    private readonly IPhilHealthSoapClient _soap = Substitute.For<IPhilHealthSoapClient>();
    private readonly ICurrentTenant _tenant = Substitute.For<ICurrentTenant>();
    private readonly CheckUploadStatusQueryHandler _sut;

    public CheckUploadStatusQueryHandlerTests()
    {
        _sut = new CheckUploadStatusQueryHandler(_soap, _tenant);
    }

    private static CheckUploadStatusQuery ValidQuery => new()
    {
        StartDate = "2025-01-01",
        EndDate = "2025-01-31"
    };

    [Fact]
    public async Task Returns_success_response_when_SOAP_succeeds()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.CheckUploadStatusAsync(
                Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(),
                Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>OK</return>", null, null));

        var result = await _sut.Handle(ValidQuery, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.RawReturn.Should().Be("<return>OK</return>");
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
        _soap.CheckUploadStatusAsync(
                Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(),
                Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "TIMEOUT", "Service timed out."));

        await Assert.ThrowsAsync<ServiceUnavailableException>(
            () => _sut.Handle(ValidQuery, CancellationToken.None));
    }

    [Fact]
    public async Task Passes_all_optional_fields_to_SOAP_client()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.CheckUploadStatusAsync(
                Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(),
                Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return/>", null, null));

        var query = new CheckUploadStatusQuery
        {
            StartDate = "2025-01-01",
            EndDate = "2025-01-31",
            TransmittalId = "TX-99",
            Report = "RPT"
        };

        await _sut.Handle(query, CancellationToken.None);

        await _soap.Received(1).CheckUploadStatusAsync(
            "2025-01-01", "2025-01-31", "TX-99", "RPT",
            Arg.Any<CancellationToken>());
    }
}
