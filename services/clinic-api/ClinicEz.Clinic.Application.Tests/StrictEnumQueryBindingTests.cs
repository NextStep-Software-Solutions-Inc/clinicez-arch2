using System.Collections.Generic;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Billing.Queries;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>Enum query parameters accept member names only; a numeric value is a 400, never a silently bound enum.</summary>
public class StrictEnumQueryBindingTests
{
    private static async Task<(IHost Host, ISender Sender)> StartAsync()
    {
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Any<GetInvoicesQuery>(), Arg.Any<CancellationToken>()).Returns(new List<InvoiceDto>());
        var clinic = Substitute.For<IClinicContext>();
        clinic.HasPermission(Arg.Any<string>()).Returns(true);

        var host = await new HostBuilder()
            .ConfigureWebHost(web => web
                .UseTestServer()
                .ConfigureServices(services =>
                {
                    services.AddRouting();
                    services.AddControllers().AddApplicationPart(typeof(BillingController).Assembly);
                    services.AddStrictStringEnums();
                    services.AddSingleton(sender);
                    services.AddSingleton(clinic);
                })
                .Configure(app =>
                {
                    app.UseRouting();
                    app.UseEndpoints(endpoints => endpoints.MapControllers());
                }))
            .StartAsync();
        return (host, sender);
    }

    [Theory]
    [InlineData("1")]
    [InlineData("0")]
    [InlineData("99")]
    [InlineData("NotAStatus")]
    public async Task NumericOrUnknownEnumQueryValue_IsRejectedWith400(string value)
    {
        var (host, sender) = await StartAsync();
        using var _ = host;

        var response = await host.GetTestClient().GetAsync($"/api/v1/billing/invoices?status={value}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        await sender.DidNotReceive().Send(Arg.Any<GetInvoicesQuery>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task EnumQueryValueByName_IsBound()
    {
        var (host, sender) = await StartAsync();
        using var _ = host;
        var name = nameof(InvoiceStatus.Paid);

        var response = await host.GetTestClient().GetAsync($"/api/v1/billing/invoices?status={name}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await sender.Received(1).Send(
            Arg.Is<GetInvoicesQuery>(q => q.Status == InvoiceStatus.Paid),
            Arg.Any<CancellationToken>());
    }
}
