using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using System.Net;

namespace ClinicEz.Interop.Tests;

/// <summary>
/// The PhilHealth proxy as a platform service of the cloud cell: facilities reach it only with <c>philhealth.request</c>, it answers
/// the requesting facility, and the one credential-carrying path (proxy &lt;-&gt; portal) is closed to everyone else.
/// </summary>
public class PlatformServiceTests
{
    private const string Proxy = "philhealth";

    private static InteropEnvelope Request(Party from, Guid? correlation = null) =>
        W.Env(InteropTypes.PhilHealthRequest, from, Party.PhilHealth, correlation,
            new PhilHealthRequestPayload { Operation = PhilHealthOperations.YakapPinValidate, Argument = "12-345" });

    [Fact]
    public async Task A_facility_asks_the_proxy_and_the_proxy_answers_that_facility()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var correlation = Guid.NewGuid();
        var request = Request(W.A1Clinic, correlation);

        (await hub.SendAsync("clinic", request)).Status.Should().Be(SendResult.Accepted);
        (await hub.PullAsync(Proxy, Proxy)).Should().ContainSingle().Which.Envelope.From.Should().Be(W.A1Clinic);

        var response = W.Env(InteropTypes.PhilHealthResponse, Party.PhilHealth, W.A1Clinic, correlation, new PhilHealthResponsePayload { StatusCode = 200 });
        (await hub.SendAsync(Proxy, response)).Status.Should().Be(SendResult.Accepted);
        (await hub.PullAsync("clinic", "clinic")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(response.MessageId);
    }

    [Fact]
    public async Task A_facility_may_send_the_proxy_nothing_but_philhealth_requests()
    {
        await using var hub = await HubApp.StartCloudAsync();

        foreach (var type in new[] { "test.ping", InteropTypes.PhilHealthConfigResponded, InteropTypes.PhilHealthConfigUpsertResponded, InteropTypes.PhilHealthResponse })
        {
            var result = await hub.SendAsync("clinic", W.Env(type, W.A1Clinic, Party.PhilHealth));
            result.Status.Should().Be(SendResult.Rejected, type);
        }

        (await hub.PullAsync(Proxy, Proxy)).Should().BeEmpty();
    }

    [Fact]
    public async Task A_facility_cannot_ask_the_portal_for_credentials()
    {
        await using var hub = await HubApp.StartCloudAsync();

        foreach (var type in new[] { InteropTypes.PhilHealthConfigRequested, InteropTypes.PhilHealthConfigUpsertRequested })
            (await hub.SendAsync("clinic", W.Env(type, W.A1Clinic, Party.Portal))).Status.Should().Be(SendResult.Rejected, type);

        (await hub.PullAsync("portal", "portal")).Should().BeEmpty();
    }

    [Fact]
    public async Task A_facility_cannot_pose_as_the_proxy()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var asProxy = W.Env(InteropTypes.PhilHealthResponse, Party.PhilHealth, W.A3Pharmacy);
        var result = await hub.SendAsync("clinic", asProxy);

        result.Status.Should().Be(SendResult.Rejected);
        (await hub.PullAsync("pharmacy", "pharmacy")).Should().BeEmpty();
    }

    [Fact]
    public async Task The_portal_cannot_pose_as_the_proxy_and_the_proxy_cannot_pose_as_the_portal()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var portalAsProxy = W.Env(InteropTypes.PhilHealthResponse, Party.PhilHealth, W.A1Clinic);
        (await hub.SendAsync("portal", portalAsProxy)).Status.Should().Be(SendResult.Rejected);

        var proxyAsPortal = W.Env(InteropTypes.PhilHealthConfigResponded, Party.Portal, Party.PhilHealth);
        (await hub.SendAsync(Proxy, proxyAsPortal)).Status.Should().Be(SendResult.Rejected);
    }

    [Fact]
    public async Task The_proxy_sends_only_philhealth_messages()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var result = await hub.SendAsync(Proxy, W.Env("test.ping", Party.PhilHealth, Party.Portal));

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().Contain("philhealth.*");
    }

    [Fact]
    public async Task The_proxy_cannot_address_facility_plane_services_or_other_tenants_data_paths()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var lab = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Laboratory };

        (await hub.SendAsync(Proxy, W.Env(InteropTypes.PhilHealthResponse, Party.PhilHealth, lab))).Status.Should().Be(SendResult.Rejected);
        (await hub.SendAsync(Proxy, W.Env(InteropTypes.PhilHealthRequest, Party.PhilHealth, Party.PhilHealth))).Status.Should().Be(SendResult.Rejected);
    }

    [Fact]
    public async Task Credentials_travel_only_between_the_proxy_and_the_portal()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var correlation = Guid.NewGuid();

        var ask = W.Env(InteropTypes.PhilHealthConfigRequested, Party.PhilHealth, Party.Portal, correlation,
            new PhilHealthConfigRequestedPayload { TenantId = W.TenantA });
        (await hub.SendAsync(Proxy, ask)).Status.Should().Be(SendResult.Accepted);
        (await hub.PullAsync("portal", "portal")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(ask.MessageId);

        var answer = W.Env(InteropTypes.PhilHealthConfigResponded, Party.Portal, Party.PhilHealth, correlation,
            new PhilHealthConfigRespondedPayload { Found = true, Config = new PhilHealthConfigPayload { TenantId = W.TenantA, Password = "x" } });
        (await hub.SendAsync("portal", answer)).Status.Should().Be(SendResult.Accepted);
        (await hub.PullAsync(Proxy, Proxy)).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(answer.MessageId);

        // Nobody else can have the answer delivered: facilities may not send it, and it is addressed to the proxy mailbox alone.
        (await hub.SendAsync("clinic", W.Env(InteropTypes.PhilHealthConfigResponded, W.A1Clinic, Party.PhilHealth))).Status.Should().Be(SendResult.Rejected);
        (await hub.PullAsync("clinic", "clinic")).Should().BeEmpty();
        (await hub.PullAsync("portal", "portal")).Should().BeEmpty();
    }

    [Fact]
    public async Task Only_the_proxy_client_may_read_the_proxy_mailbox()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.RawAs("clinic").GetAsync($"/v1/inbox?service={Proxy}")).StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.BadRequest);
        (await hub.RawAs("portal").GetAsync($"/v1/inbox?service={Proxy}")).StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.BadRequest);
        (await hub.RawAs(Proxy).GetAsync($"/v1/inbox?service={Proxy}")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_local_hub_forwards_a_facility_request_to_the_cloud_proxy()
    {
        await using var f = await Federation.StartAsync();
        var request = Request(W.E1Clinic);

        (await f.Local.SendAsync("local-clinic", request)).Status.Should().Be(SendResult.Accepted);
        (await f.ForwardAsync()).Should().Be(1);

        (await f.Cloud.PullAsync(Proxy, Proxy)).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(request.MessageId);
    }

    [Fact]
    public async Task The_proxy_response_reaches_a_facility_in_an_edge_cell_through_its_cell_inbox()
    {
        await using var f = await Federation.StartAsync();
        var response = W.Env(InteropTypes.PhilHealthResponse, Party.PhilHealth, W.E1Clinic, null, new PhilHealthResponsePayload { StatusCode = 200 });

        (await f.Cloud.SendAsync(Proxy, response)).Status.Should().Be(SendResult.Accepted);
        (await f.PullCellInboxAsync()).Should().Be(1);

        (await f.Local.PullAsync("local-clinic", "clinic")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(response.MessageId);
    }

    [Fact]
    public async Task Platform_service_clients_are_created_only_for_platform_services_in_the_cloud_cell()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var admin = hub.AdminSdk();

        var created = await admin.CreateClientAsync("cloud", new CreateHubClientRequest(Proxy, HubClientKind.PlatformService), CancellationToken.None);
        created.Kind.Should().Be(HubClientKind.PlatformService);
        created.SigningKey.Should().NotBeNullOrEmpty();

        var wrongService = () => admin.CreateClientAsync("cloud", new CreateHubClientRequest("clinic", HubClientKind.PlatformService), CancellationToken.None);
        (await wrongService.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var stolenName = () => admin.CreateClientAsync("cloud", new CreateHubClientRequest(Proxy, HubClientKind.CloudService), CancellationToken.None);
        (await stolenName.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var inEdge = () => admin.CreateClientAsync(W.EdgeCell, new CreateHubClientRequest(Proxy, HubClientKind.PlatformService), CancellationToken.None);
        (await inEdge.Should().ThrowAsync<HttpRequestException>()).Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_platform_service_client_cannot_read_the_directory()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.RawAs(Proxy).GetAsync("/v1/directory/facilities")).StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task A_facility_asks_the_media_broker_and_the_broker_answers_that_facility()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var callId = Guid.NewGuid();
        var requestPayload = new MediaRoomRequestedPayload(W.TenantA, callId, "teleconsult-room-1", ["staff-1", "patient-1"]);
        var request = W.Env(InteropTypes.MediaRoomRequested, W.A1Clinic, Party.Media, callId, requestPayload);

        (await hub.SendAsync("clinic", request)).Status.Should().Be(SendResult.Accepted);
        var pulled = await hub.PullAsync("media", "media");
        pulled.Should().ContainSingle().Which.Envelope.From.Should().Be(W.A1Clinic);

        var responsePayload = new MediaRoomRespondedPayload(
            callId,
            "teleconsult-room-1",
            "wss://relay.clinicez.internal",
            new Dictionary<string, string> { ["staff-1"] = "token-1", ["patient-1"] = "token-2" },
            true,
            null);
        var response = W.Env(InteropTypes.MediaRoomResponded, Party.Media, W.A1Clinic, callId, responsePayload);

        (await hub.SendAsync("media", response)).Status.Should().Be(SendResult.Accepted);
        (await hub.PullAsync("clinic", "clinic")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(response.MessageId);
    }

    [Fact]
    public async Task Non_facility_clients_cannot_request_media_room()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var callId = Guid.NewGuid();
        var payload = new MediaRoomRequestedPayload(W.TenantA, callId, "room-1", ["user-1"]);

        // Portal cannot request room
        var fromPortal = W.Env(InteropTypes.MediaRoomRequested, Party.Portal, Party.Media, callId, payload);
        (await hub.SendAsync("portal", fromPortal)).Status.Should().Be(SendResult.Rejected);

        // Patient plane cannot request room
        var patientParty = Party.ForPatient("patient-1");
        var fromPatient = W.Env(InteropTypes.MediaRoomRequested, patientParty, Party.Media, callId, payload);
        (await hub.SendAsync("patient", fromPatient)).Status.Should().Be(SendResult.Rejected);

        (await hub.PullAsync("media", "media")).Should().BeEmpty();
    }

    [Fact]
    public async Task Portal_updates_media_entitlements_and_facility_is_rejected()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var payload = new MediaEntitlementUpdatedPayload(W.TenantA, 500, true, 1, DateTime.UtcNow);

        // Portal can update entitlements on Media
        var fromPortal = W.Env(InteropTypes.MediaEntitlementUpdated, Party.Portal, Party.Media, Guid.NewGuid(), payload);
        (await hub.SendAsync("portal", fromPortal)).Status.Should().Be(SendResult.Accepted);
        (await hub.PullAsync("media", "media")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(fromPortal.MessageId);

        // Facility caller is rejected
        var fromClinic = W.Env(InteropTypes.MediaEntitlementUpdated, W.A1Clinic, Party.Media, Guid.NewGuid(), payload);
        (await hub.SendAsync("clinic", fromClinic)).Status.Should().Be(SendResult.Rejected);
    }

    [Fact]
    public async Task Media_broker_records_usage_to_portal_and_facility_is_rejected()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var payload = new MediaUsageRecordedPayload(Guid.NewGuid(), W.TenantA, 15, DateTime.UtcNow.AddMinutes(-15), DateTime.UtcNow);

        // Media broker can record usage to portal
        var fromMedia = W.Env(InteropTypes.MediaUsageRecorded, Party.Media, Party.Portal, Guid.NewGuid(), payload);
        (await hub.SendAsync("media", fromMedia)).Status.Should().Be(SendResult.Accepted);
        (await hub.PullAsync("portal", "portal")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(fromMedia.MessageId);

        // Facility cannot record usage to portal
        var fromClinic = W.Env(InteropTypes.MediaUsageRecorded, W.A1Clinic, Party.Portal, Guid.NewGuid(), payload);
        (await hub.SendAsync("clinic", fromClinic)).Status.Should().Be(SendResult.Rejected);
    }

    [Fact]
    public async Task Media_broker_sends_only_media_messages()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var invalid = W.Env("test.ping", Party.Media, Party.Portal);
        var result = await hub.SendAsync("media", invalid);

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().Contain("media.*");
    }
}
