using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading.Tasks;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>
/// The internal service key is a static shared secret, so its blast radius is limited: default-deny outside permission-guarded
/// endpoints, and a rotation window (<c>Internal:PreviousApiKey</c>) that lets the key be replaced without downtime.
/// </summary>
public class InternalServiceGuardTests
{
    private const string Key = "current-internal-key";
    private const string OldKey = "previous-internal-key";

    private sealed class GuardedMarker : IPermissionGuarded { }

    private static async Task<(WebApplication App, HttpClient Client)> StartAsync(string? previousKey = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var settings = new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ["Internal:ApiKey"] = Key
        };
        if (previousKey is not null) settings["Internal:PreviousApiKey"] = previousKey;
        builder.Configuration.AddInMemoryCollection(settings);
        builder.Services.AddFacilityLocalAuth(builder.Configuration, "clinicez-clinic");

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseInternalServiceGuard();
        app.MapGet("/unguarded", () => Results.Ok("plain"));
        app.MapGet("/guarded", () => Results.Ok("guarded")).WithMetadata(new GuardedMarker());
        app.MapGet("/open", () => Results.Ok("open")).AllowAnonymous();
        await app.StartAsync();
        return (app, app.GetTestClient());
    }

    private static async Task<HttpStatusCode> StatusAsync(HttpClient client, string url, string? key)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        if (key is not null) request.Headers.TryAddWithoutValidation(FacilityAuthSchemes.InternalKeyHeader, key);
        using var response = await client.SendAsync(request);
        return response.StatusCode;
    }

    [Fact]
    public async Task InternalKey_IsDeniedOnEndpointsWithoutAPermissionGuard()
    {
        var (app, client) = await StartAsync();
        await using var _ = app;

        (await StatusAsync(client, "/unguarded", Key)).Should().Be(HttpStatusCode.Forbidden);
        (await StatusAsync(client, "/guarded", Key)).Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task InternalKey_WrongOrMissing_IsStillRejected()
    {
        var (app, client) = await StartAsync();
        await using var _ = app;

        (await StatusAsync(client, "/guarded", "wrong")).Should().Be(HttpStatusCode.Unauthorized);
        (await StatusAsync(client, "/guarded", null)).Should().Be(HttpStatusCode.Unauthorized);
        (await StatusAsync(client, "/open", null)).Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task PreviousKey_IsAcceptedOnlyDuringARotationWindow()
    {
        var (rotating, rotatingClient) = await StartAsync(OldKey);
        await using (rotating)
        {
            (await StatusAsync(rotatingClient, "/guarded", OldKey)).Should().Be(HttpStatusCode.OK);
            (await StatusAsync(rotatingClient, "/guarded", Key)).Should().Be(HttpStatusCode.OK);
        }

        var (settled, settledClient) = await StartAsync();
        await using (settled)
        {
            (await StatusAsync(settledClient, "/guarded", OldKey)).Should().Be(HttpStatusCode.Unauthorized);
        }
    }

    [Fact]
    public void ServicePermissionAttributes_AreRecognisedByTheGuard()
    {
        typeof(ClinicEz.Clinic.Api.Authorization.HasPermissionAttribute).Should().BeAssignableTo<IPermissionGuarded>();
    }
}