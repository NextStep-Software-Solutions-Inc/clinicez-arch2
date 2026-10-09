using System.Net;
using System.Net.Http.Json;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Interop.Tests;

public class SecretHasherTests
{
    [Fact]
    public void Hash_is_salted_and_verifies_only_the_right_secret()
    {
        var a = SecretHasher.Hash("s3cret", 1000);
        var b = SecretHasher.Hash("s3cret", 1000);

        a.Should().NotBe(b, "every hash has its own salt");
        a.Should().NotContain("s3cret").And.StartWith("pbkdf2-sha256$1000$");
        SecretHasher.Verify("s3cret", a).Should().BeTrue();
        SecretHasher.Verify("s3cret", b).Should().BeTrue();
        SecretHasher.Verify("S3cret", a).Should().BeFalse();
        SecretHasher.Verify("", a).Should().BeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("plain-text")]
    [InlineData("pbkdf2-sha256$x$y$z")]
    [InlineData("pbkdf2-sha256$1000$!!!$!!!")]
    public void Malformed_stored_values_never_verify(string stored) =>
        SecretHasher.Verify("anything", stored).Should().BeFalse();

    [Fact]
    public void Generated_secrets_are_unique_and_url_safe()
    {
        var secrets = Enumerable.Range(0, 20).Select(_ => SecretHasher.GenerateSecret()).ToList();
        secrets.Distinct().Should().HaveCount(20);
        secrets.Should().OnlyContain(s => s.Length >= 43 && s.All(c => char.IsLetterOrDigit(c) || c == '-' || c == '_'));
    }
}

public class AuthenticationTests
{
    internal static async Task<string> StartupFailureAsync(Func<Task<HubApp>> start)
    {
        try
        {
            await using var hub = await start();
        }
        catch (Exception ex)
        {
            return ex.ToString();
        }

        throw new Xunit.Sdk.XunitException("The hub started, but startup was expected to fail.");
    }

    [Fact]
    public async Task Missing_or_wrong_credentials_get_401_and_valid_ones_get_through()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.Raw().GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await hub.Raw("clinic", "wrong").GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await hub.Raw("nobody", "whatever").GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await hub.Raw("clinic").GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await hub.RawAs("clinic").GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.OK);

        var send = await hub.Raw("clinic", "wrong").PostAsJsonAsync("/v1/messages", new HubHttpClient.SendRequest([]), InteropJson.Options);
        send.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_SDK_client_surfaces_a_401_as_an_HttpRequestException()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var act = () => hub.Sdk("clinic", "wrong").PullAsync("clinic", 10, 0, CancellationToken.None);

        (await act.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Health_is_anonymous()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.Raw().GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await hub.Raw().GetAsync("/health/ready")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_client_may_only_read_its_own_service_mailbox()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.RawAs("clinic").GetAsync("/v1/inbox?service=laboratory")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.RawAs("clinic").GetAsync("/v1/inbox")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Development_environment_seeds_the_documented_dev_clients()
    {
        await using var hub = await HubApp.StartCloudAsync(environment: "Development", seed: false, bootstrap: false);

        foreach (var service in new[] { "clinic", "laboratory", "pharmacy", "organization", "billing", "patient", "portal" })
        {
            var response = await hub.Raw($"dev-{service}", $"dev-{service}-secret").GetAsync($"/v1/inbox?service={service}");
            response.StatusCode.Should().Be(HttpStatusCode.OK, $"dev-{service} is bootstrapped in Development");
        }
    }

    [Fact]
    public async Task Production_refuses_to_start_without_a_control_plane_client()
    {
        var failure = await StartupFailureAsync(() => HubApp.StartCloudAsync(seed: false, overrides: new()
        {
            ["Hub:Bootstrap:Clients:0:Kind"] = "CloudService"
        }));

        failure.Should().Contain("ControlPlane");
    }

    [Fact]
    public async Task Production_refuses_weak_bootstrap_secrets()
    {
        var failure = await StartupFailureAsync(() => HubApp.StartCloudAsync(seed: false, overrides: new()
        {
            ["Hub:Bootstrap:Clients:0:Secret"] = "short"
        }));

        failure.Should().Contain("at least 24");
    }

    [Fact]
    public async Task Bootstrap_is_declarative_a_changed_secret_replaces_the_stored_hash()
    {
        await using var hub = await HubApp.StartCloudAsync(seed: false);
        var before = await hub.DbAsync(db => db.Clients.AsNoTracking().SingleAsync(c => c.ClientId == "clinic"));
        before.SecretHash.Should().StartWith("pbkdf2-sha256$").And.NotContain(W.Secret("clinic"));

        using var scope = hub.Services.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<ClinicEz.Interop.Application.HubOptions>>().Value;
        options.Bootstrap!.Clients.Single(c => c.ClientId == "clinic").Secret = "a-brand-new-clinic-secret-0123456789";
        await scope.ServiceProvider.GetRequiredService<ClinicEz.Interop.Application.Bootstrap.HubBootstrapper>().ApplyAsync(false, CancellationToken.None);

        (await hub.Raw("clinic", W.Secret("clinic")).GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await hub.Raw("clinic", "a-brand-new-clinic-secret-0123456789").GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.OK);
    }
}

public class AdminApiTests
{
    [Fact]
    public async Task Admin_endpoints_are_for_control_plane_clients_only()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var body = JsonContent.Create(new DirectoryCellUpsertedPayload { CellId = "x", Name = "x", Kind = CellKind.Cloud }, options: InteropJson.Options);

        (await hub.RawAs("lab").PutAsync("/v1/admin/cells/x", body)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.RawAs("lab").DeleteAsync("/v1/admin/clients/clinic")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.Raw().PostAsync("/v1/admin/clients/clinic/rotate", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task A_new_cell_and_client_work_and_the_secret_is_returned_once_and_stored_hashed()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var admin = hub.AdminSdk();

        await admin.UpsertCellAsync(new DirectoryCellUpsertedPayload { CellId = "edge-2", Name = "Edge 2", Kind = CellKind.Edge, TenantId = "tenant-z" }, CancellationToken.None);
        var credentials = await admin.CreateClientAsync("edge-2", new CreateHubClientRequest("cell", HubClientKind.EdgeCell), CancellationToken.None);

        credentials.CellId.Should().Be("edge-2");
        credentials.Kind.Should().Be(HubClientKind.EdgeCell);
        credentials.ClientSecret.Should().NotBeNullOrWhiteSpace();
        (await hub.Raw(credentials.ClientId, credentials.ClientSecret).GetAsync("/v1/cell-inbox")).StatusCode.Should().Be(HttpStatusCode.OK);

        var stored = await hub.DbAsync(db => db.Clients.AsNoTracking().SingleAsync(c => c.ClientId == credentials.ClientId));
        stored.SecretHash.Should().NotContain(credentials.ClientSecret).And.StartWith("pbkdf2-sha256$");
    }

    [Fact]
    public async Task Rotate_replaces_the_secret_and_revoke_disables_the_client()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var admin = hub.AdminSdk();
        var created = await admin.CreateClientAsync("cloud", new CreateHubClientRequest("clinic", HubClientKind.CloudService), CancellationToken.None);
        (await hub.Raw(created.ClientId, created.ClientSecret).GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.OK);

        var rotated = await admin.RotateClientAsync(created.ClientId, CancellationToken.None);

        rotated.ClientId.Should().Be(created.ClientId);
        rotated.ClientSecret.Should().NotBe(created.ClientSecret);
        (await hub.Raw(created.ClientId, created.ClientSecret).GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await hub.Raw(created.ClientId, rotated.ClientSecret).GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.OK);

        await admin.RevokeClientAsync(created.ClientId, CancellationToken.None);

        (await hub.Raw(created.ClientId, rotated.ClientSecret).GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var rotateRevoked = () => admin.RotateClientAsync(created.ClientId, CancellationToken.None);
        (await rotateRevoked.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Invalid_admin_requests_are_refused()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var admin = hub.AdminSdk();

        var unknownCell = () => admin.CreateClientAsync("nope", new CreateHubClientRequest("clinic", HubClientKind.CloudService), CancellationToken.None);
        (await unknownCell.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var edgeKindOnCloud = () => admin.CreateClientAsync("cloud", new CreateHubClientRequest("clinic", HubClientKind.EdgeCell), CancellationToken.None);
        (await edgeKindOnCloud.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var cloudKindOnEdge = () => admin.CreateClientAsync(W.EdgeCell, new CreateHubClientRequest("clinic", HubClientKind.CloudService), CancellationToken.None);
        (await cloudKindOnEdge.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var badService = () => admin.CreateClientAsync("cloud", new CreateHubClientRequest("Cell-Inbox", HubClientKind.CloudService), CancellationToken.None);
        (await badService.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var unknownClient = () => admin.RevokeClientAsync("ghost", CancellationToken.None);
        (await unknownClient.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
