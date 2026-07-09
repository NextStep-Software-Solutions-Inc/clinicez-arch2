using Clinic EZ.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using PhilHealthProxy.Application.Features.Reports.Commands.ValidateReport;
using PhilHealthProxy.Application.Features.Reports.Commands.SubmitReport;
using PhilHealthProxy.Domain.Interfaces;
using PhilHealthProxy.Domain.Models;
using Xunit;

namespace PhilHealthProxy.Application.Tests.Handlers;

public sealed class ReportCommandHandlerTests
{
    private readonly IPhilHealthSoapClient _soap = Substitute.For<IPhilHealthSoapClient>();
    private readonly ICurrentTenant _tenant = Substitute.For<ICurrentTenant>();

    // ── ValidateReport ────────────────────────────────────────────────────────

    [Fact]
    public async Task ValidateReport_returns_success_when_SOAP_succeeds()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.ValidateReportAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>VALID</return>", null, null));

        var handler = new ValidateReportCommandHandler(_soap, _tenant);
        var result = await handler.Handle(
            new ValidateReportCommand { ReportTagging = "TAG-1", Report = "<xml/>" },
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.RawReturn.Should().Be("<return>VALID</return>");
    }

    [Fact]
    public async Task ValidateReport_throws_UnauthorizedException_when_tenant_is_null()
    {
        _tenant.TenantId.Returns((Guid?)null);
        var handler = new ValidateReportCommandHandler(_soap, _tenant);

        await Assert.ThrowsAsync<UnauthorizedException>(
            () => handler.Handle(
                new ValidateReportCommand { ReportTagging = "TAG-1", Report = "<xml/>" },
                CancellationToken.None));
    }

    [Fact]
    public async Task ValidateReport_throws_ServiceUnavailableException_when_SOAP_fails()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.ValidateReportAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "INVALID", "Validation failed on server."));
        var handler = new ValidateReportCommandHandler(_soap, _tenant);

        await Assert.ThrowsAsync<ServiceUnavailableException>(
            () => handler.Handle(
                new ValidateReportCommand { ReportTagging = "TAG-1", Report = "<xml/>" },
                CancellationToken.None));
    }

    // ── SubmitReport ──────────────────────────────────────────────────────────

    [Fact]
    public async Task SubmitReport_returns_success_when_SOAP_succeeds()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.SubmitReportAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>SUBMITTED</return>", null, null));

        var handler = new SubmitReportCommandHandler(_soap, _tenant);
        var result = await handler.Handle(
            new SubmitReportCommand { TransmittalId = "TX-001", Report = "<xml/>", ReportTagging = "TAG-1" },
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.RawReturn.Should().Be("<return>SUBMITTED</return>");
    }

    [Fact]
    public async Task SubmitReport_throws_UnauthorizedException_when_tenant_is_null()
    {
        _tenant.TenantId.Returns((Guid?)null);
        var handler = new SubmitReportCommandHandler(_soap, _tenant);

        await Assert.ThrowsAsync<UnauthorizedException>(
            () => handler.Handle(
                new SubmitReportCommand { TransmittalId = "TX-001", Report = "<xml/>", ReportTagging = "TAG-1" },
                CancellationToken.None));
    }

    [Fact]
    public async Task SubmitReport_throws_ServiceUnavailableException_when_SOAP_fails()
    {
        _tenant.TenantId.Returns(Guid.NewGuid());
        _soap.SubmitReportAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "REJECTED", "Submission rejected."));
        var handler = new SubmitReportCommandHandler(_soap, _tenant);

        await Assert.ThrowsAsync<ServiceUnavailableException>(
            () => handler.Handle(
                new SubmitReportCommand { TransmittalId = "TX-001", Report = "<xml/>", ReportTagging = "TAG-1" },
                CancellationToken.None));
    }
}
