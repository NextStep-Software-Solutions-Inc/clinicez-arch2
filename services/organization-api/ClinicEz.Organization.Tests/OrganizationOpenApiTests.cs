using System.Collections.Generic;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Organization.Api;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Scalar.AspNetCore;

namespace ClinicEz.Organization.Tests;

public sealed class OrganizationOpenApiTests
{
    private static async Task<WebApplication> StartTestAppAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Environment.EnvironmentName = "Development";
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = new string('k', 32)
        });

        builder.Services.AddApiServices();
        builder.Services.AddControllers().AddApplicationPart(typeof(DependencyInjection).Assembly);
        builder.Services.AddFacilityLocalAuth(builder.Configuration, audience: "clinicez-organization");

        var app = builder.Build();
        app.MapOpenApi().AllowAnonymous();
        app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Organization Dashboard API")).AllowAnonymous();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();

        await app.StartAsync();
        return app;
    }

    [Fact]
    public async Task OpenApiAndScalarEndpoints_AllowAnonymousAccessDespiteFallbackPolicy()
    {
        await using var app = await StartTestAppAsync();
        var client = app.GetTestClient();

        var openApiResponse = await client.GetAsync("/openapi/v1.json");
        var openApiBody = await openApiResponse.Content.ReadAsStringAsync();
        openApiResponse.StatusCode.Should().Be(HttpStatusCode.OK, because: openApiBody);

        using var doc = JsonDocument.Parse(openApiBody);
        doc.RootElement.TryGetProperty("openapi", out _).Should().BeTrue();

        var scalarResponse = await client.GetAsync("/scalar/v1");
        var scalarBody = await scalarResponse.Content.ReadAsStringAsync();
        scalarResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        scalarResponse.Content.Headers.ContentType?.MediaType.Should().Be("text/html");
        scalarBody.Should().Contain("openapi/v1.json");
    }
}
