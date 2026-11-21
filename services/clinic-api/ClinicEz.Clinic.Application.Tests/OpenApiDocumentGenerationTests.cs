using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Scalar.AspNetCore;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class OpenApiDocumentGenerationTests
{
    private static async Task<(WebApplication App, ISender Sender)> StartTestAppAsync()
    {
        var sender = Substitute.For<ISender>();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.HasPermission(Arg.Any<string>()).Returns(true);

        var builder = WebApplication.CreateBuilder();
        builder.Environment.EnvironmentName = "Development";
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = new string('k', 32)
        });

        builder.Services.AddApiServices();
        builder.Services.AddControllers().AddApplicationPart(typeof(ServicesController).Assembly);
        builder.Services.AddFacilityLocalAuth(builder.Configuration, audience: "clinicez-clinic");
        builder.Services.AddSingleton(sender);
        builder.Services.AddSingleton(clinicContext);

        var app = builder.Build();
        app.MapOpenApi().AllowAnonymous();
        app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Clinic Dashboard API")).AllowAnonymous();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();

        await app.StartAsync();
        return (app, sender);
    }

    [Fact]
    public async Task OpenApiV1Document_GeneratesSuccessfullyWithoutAuth()
    {
        var (app, _) = await StartTestAppAsync();
        await using (app)
        {
            var response = await app.GetTestClient().GetAsync("/openapi/v1.json");
            var body = await response.Content.ReadAsStringAsync();

            response.StatusCode.Should().Be(HttpStatusCode.OK, because: body);
            using var doc = JsonDocument.Parse(body);
            doc.RootElement.TryGetProperty("openapi", out var version).Should().BeTrue();
            version.GetString().Should().NotBeNullOrWhiteSpace();
            doc.RootElement.GetProperty("paths").TryGetProperty("/api/v1/services/{id}", out _).Should().BeTrue();
        }
    }

    [Fact]
    public async Task ScalarV1Page_ReturnsHtmlWithoutAuth()
    {
        var (app, _) = await StartTestAppAsync();
        await using (app)
        {
            var response = await app.GetTestClient().GetAsync("/scalar/v1");
            var body = await response.Content.ReadAsStringAsync();

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            response.Content.Headers.ContentType?.MediaType.Should().Be("text/html");
            body.Should().Contain("openapi/v1.json");
        }
    }

    [Fact]
    public async Task UpdateService_BindsRequestWithoutBodyId_AndDispatchesRouteId()
    {
        var (app, sender) = await StartTestAppAsync();
        await using (app)
        {
            var serviceId = Guid.NewGuid();
            var clinicId = Guid.NewGuid();
            sender.Send(Arg.Any<UpdateClinicServiceItemCommand>(), Arg.Any<CancellationToken>())
                .Returns(new ClinicServiceItemDto(
                    serviceId,
                    "tenant-1",
                    clinicId,
                    "SVC-01",
                    "Consultation",
                    "Consultation",
                    500m,
                    "Standard consult",
                    true));

            var tokens = app.Services.GetRequiredService<IFacilityTokenService>();
            var jwt = tokens.CreateAccessToken(new[] { new Claim("sub", "staff-1") }).Token;

            var client = app.GetTestClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

            var response = await client.PutAsJsonAsync($"/api/v1/services/{serviceId}", new
            {
                name = "Consultation",
                category = "Consultation",
                standardPrice = 500m,
                description = "Standard consult",
                isActive = true
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            await sender.Received(1).Send(
                Arg.Is<UpdateClinicServiceItemCommand>(cmd =>
                    cmd.Id == serviceId &&
                    cmd.Name == "Consultation" &&
                    cmd.Category == "Consultation" &&
                    cmd.StandardPrice == 500m &&
                    cmd.Description == "Standard consult" &&
                    cmd.IsActive),
                Arg.Any<CancellationToken>());
        }
    }
}
