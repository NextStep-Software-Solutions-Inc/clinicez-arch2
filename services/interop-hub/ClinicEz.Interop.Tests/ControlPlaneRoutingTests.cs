using System.Net;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Routing;
using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;

namespace ClinicEz.Interop.Tests;

/// <summary>Control-plane parties other than the portal (the patient plane, cloud-cell services), who may address them, and how they route.</summary>
public class ControlPlaneRoutingTests
{
    private const string Ping = "test.ping";

    private static readonly Party PatientService = new() { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };
    private static readonly Party LaboratoryService = new() { Kind = PartyKind.ControlPlane, Service = InteropServices.Laboratory };
    private static readonly Party BillingService = new() { Kind = PartyKind.ControlPlane, Service = InteropServices.Billing };

    [Fact]
    public async Task The_portal_reaches_patient_api_through_the_control_plane_patient_service()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var envelope = W.Env(Ping, Party.Portal, PatientService);

        (await hub.SendAsync("portal", envelope)).Status.Should().Be(SendResult.Accepted);

        (await hub.PullAsync("patient", "patient")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(envelope.MessageId);
    }

    [Fact]
    public async Task A_facility_client_may_address_the_patient_and_portal_services()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var toPatient = W.Env(Ping, W.A1Clinic, PatientService);
        var toPortal = W.Env(Ping, W.A1Clinic, Party.Portal);

        (await hub.SendAsync("clinic", toPatient)).Status.Should().Be(SendResult.Accepted);
        (await hub.SendAsync("clinic", toPortal)).Status.Should().Be(SendResult.Accepted);

        (await hub.PullAsync("patient", "patient")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(toPatient.MessageId);
        (await hub.PullAsync("portal", "portal")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(toPortal.MessageId);
    }

    [Theory]
    [InlineData(InteropServices.Laboratory)]
    [InlineData(InteropServices.Pharmacy)]
    [InlineData(InteropServices.Clinic)]
    [InlineData(InteropServices.Organization)]
    [InlineData(InteropServices.Billing)]
    public async Task A_facility_client_cannot_address_other_cloud_cell_services_as_control_plane(string service)
    {
        await using var hub = await HubApp.StartCloudAsync();
        var target = new Party { Kind = PartyKind.ControlPlane, Service = service };

        var result = await hub.SendAsync("clinic", W.Env(Ping, W.A1Clinic, target));

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().Contain("'portal' and 'patient'");
        (await hub.MessageCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task The_control_plane_and_patient_plane_may_address_cloud_cell_services()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var fromPortal = W.Env(Ping, Party.Portal, LaboratoryService);
        var fromPatientPlane = W.Env(Ping, PatientService, BillingService);

        (await hub.SendAsync("portal", fromPortal)).Status.Should().Be(SendResult.Accepted);
        (await hub.SendAsync("patient", fromPatientPlane)).Status.Should().Be(SendResult.Accepted);

        (await hub.PullAsync("lab", "laboratory")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(fromPortal.MessageId);
        (await hub.PullAsync("billing", "billing")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(fromPatientPlane.MessageId);
    }

    [Fact]
    public async Task An_unknown_control_plane_service_is_rejected()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var result = await hub.SendAsync("portal", W.Env(Ping, Party.Portal, new Party { Kind = PartyKind.ControlPlane, Service = "nonsense" }));

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().Contain("Unknown control-plane service");
    }

    [Fact]
    public async Task A_local_hub_forwards_control_plane_patient_messages_and_refuses_other_services_itself()
    {
        await using var f = await Federation.StartAsync();
        var toPatient = W.Env(Ping, W.E1Clinic, PatientService);

        (await f.Local.SendAsync("local-clinic", toPatient)).Status.Should().Be(SendResult.Accepted);
        var toLab = await f.Local.SendAsync("local-clinic", W.Env(Ping, W.E1Clinic, LaboratoryService));

        toLab.Status.Should().Be(SendResult.Rejected);
        (await f.ForwardAsync()).Should().Be(1);
        (await f.Cloud.PullAsync("patient", "patient")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(toPatient.MessageId);
    }
}

/// <summary>
/// Facility types are strict string enums on the wire: a type name this hub build does not know (a newer service,
/// say imaging) is a client error at the boundary - never a 500, never a numeric fallback, nothing stored.
/// </summary>
public class UnknownFacilityTypeTests
{
    private const string Ping = "test.ping";

    private static readonly Party Lab = Party.ForFacility("tenant-x", "x-lab", FacilityType.Laboratory);

    /// <summary>Serialize with the SDK, then swap one known type name for one this hub has never heard of.</summary>
    private static string WithFutureType(object body) =>
        System.Text.RegularExpressions.Regex.Replace(
            System.Text.Json.JsonSerializer.Serialize(body, InteropJson.Options),
            "(\"facilityType\"\\s*:\\s*)\"Clinic\"",
            "$1\"Imaging\"",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    private static StringContent Json(string json) => new(json, System.Text.Encoding.UTF8, "application/json");

    [Fact]
    public async Task A_message_to_a_type_name_the_hub_does_not_know_is_a_client_error_and_nothing_is_stored()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var to = new Party { Kind = PartyKind.Facility, TenantId = "tenant-x", FacilityId = "x-imaging", FacilityType = FacilityType.Clinic };
        var body = WithFutureType(new HubHttpClient.SendRequest([W.Env(Ping, Party.Portal, to)]));
        body.Should().Contain("Imaging");

        var response = await hub.RawAs("portal").PostAsync("/v1/messages", Json(body));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await hub.MessageCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task A_numeric_facility_type_is_rejected_too()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var to = new Party { Kind = PartyKind.Facility, TenantId = "tenant-x", FacilityId = "x-lab", FacilityType = FacilityType.Clinic };
        var body = System.Text.RegularExpressions.Regex.Replace(
            System.Text.Json.JsonSerializer.Serialize(new HubHttpClient.SendRequest([W.Env(Ping, Party.Portal, to)]), InteropJson.Options),
            "(\"facilityType\"\\s*:\\s*)\"Clinic\"",
            "${1}0",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        var response = await hub.RawAs("portal").PostAsync("/v1/messages", Json(body));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await hub.MessageCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task A_facility_addressed_with_an_explicit_service_is_routed_by_that_service()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertFacilityAsync(Lab, FacilityVisibility.Network);
        var to = new Party { Kind = PartyKind.Facility, TenantId = "tenant-x", FacilityId = "x-lab", Service = InteropServices.Laboratory };
        var envelope = W.Env(Ping, Party.Portal, to);

        (await hub.SendAsync("portal", envelope)).Status.Should().Be(SendResult.Accepted);

        (await hub.PullAsync("lab", "laboratory")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(envelope.MessageId);
    }

    [Fact]
    public async Task A_claim_for_a_type_name_the_hub_does_not_know_is_a_client_error_not_a_server_error()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var order = W.Env(InteropTypes.LabOrderIssued, W.A1Clinic, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Clinic });
        var body = WithFutureType(new CreateClaimRequest(order));

        var created = await hub.RawAs("clinic").PostAsync("/v1/claims", Json(body));

        created.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
/// <summary><c>Hub:Upstream:Enabled=false</c>: a single-site / air-gapped local hub that never calls the cloud.</summary>
public class AirGappedLocalHubTests
{
    private const string Ping = "test.ping";

    private static Task<HubApp> StartAirGappedAsync(UpstreamSwitch upstream) =>
        HubApp.StartLocalAsync(upstream, overrides: new Dictionary<string, string?>
        {
            ["Hub:Upstream:Enabled"] = "false",
            ["Hub:Upstream:Url"] = "",
            ["Hub:Upstream:ClientId"] = "",
            ["Hub:Upstream:ClientSecret"] = ""
        });

    [Fact]
    public async Task It_starts_without_upstream_url_or_credentials()
    {
        await using var hub = await StartAirGappedAsync(new UpstreamSwitch());

        (await hub.Raw().GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Same_cell_messages_are_still_delivered_on_the_LAN()
    {
        var upstream = new UpstreamSwitch();
        await using var hub = await StartAirGappedAsync(upstream);
        var envelope = W.Env(InteropTypes.LabOrderIssued, W.E1Clinic, W.E2Lab);

        (await hub.SendAsync("local-clinic", envelope)).Status.Should().Be(SendResult.Accepted);

        (await hub.PullAsync("local-lab", "laboratory")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(envelope.MessageId);
        upstream.Requests.Should().Be(0);
    }

    [Fact]
    public async Task Messages_beyond_the_cell_are_rejected_with_a_clear_reason_and_nothing_is_queued()
    {
        var upstream = new UpstreamSwitch();
        await using var hub = await StartAirGappedAsync(upstream);

        var toPortal = await hub.SendAsync("local-clinic", W.Env(Ping, W.E1Clinic, Party.Portal));
        var toPatient = await hub.SendAsync("local-clinic", W.Env(Ping, W.E1Clinic, Party.ForPatient("p1")));
        var toOtherCell = await hub.SendAsync("local-clinic", W.Env(Ping, W.E1Clinic, W.B1Lab));

        foreach (var result in new[] { toPortal, toPatient, toOtherCell })
        {
            result.Status.Should().Be(SendResult.Rejected);
            result.Reason.Should().StartWith(RoutingPolicy.UpstreamDisabled).And.Contain("Hub:Upstream:Enabled=false");
        }

        (await hub.OutboundCountAsync()).Should().Be(0);
        upstream.Requests.Should().Be(0);
    }

    [Fact]
    public async Task Claims_answer_503_with_the_upstream_disabled_reason()
    {
        var upstream = new UpstreamSwitch();
        await using var hub = await StartAirGappedAsync(upstream);
        var order = W.Env(InteropTypes.LabOrderIssued, W.E1Clinic, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Laboratory });

        var response = await hub.RawAs("local-clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(order));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        (await response.Content.ReadAsStringAsync()).Should().Contain(RoutingPolicy.UpstreamDisabled);
        upstream.Requests.Should().Be(0);
    }

    [Fact]
    public async Task Upstream_settings_are_still_required_while_the_upstream_is_enabled()
    {
        var failure = await AuthenticationTests.StartupFailureAsync(() => HubApp.StartLocalAsync(
            new UpstreamSwitch(), overrides: new Dictionary<string, string?> { ["Hub:Upstream:Url"] = "" }));

        failure.Should().Contain("Hub:Upstream:Url").And.Contain("Hub:Upstream:Enabled=false");
    }
}
