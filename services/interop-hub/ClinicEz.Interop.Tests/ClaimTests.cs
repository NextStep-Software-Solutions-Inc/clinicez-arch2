using System.Net;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.Tests;

public class ClaimTests
{
    private static InteropEnvelope Order(Party from, FacilityType target = FacilityType.Laboratory, Guid? correlation = null) =>
        W.Env(InteropTypes.LabOrderIssued, from, new Party { Kind = PartyKind.Facility, FacilityType = target }, correlation);

    private static async Task<CreateClaimResponse> CreateAsync(HubApp hub, string client, InteropEnvelope envelope, int? ttlHours = null)
    {
        var response = await hub.RawAs(client).PostJsonAsync("/v1/claims", new CreateClaimRequest(envelope, ttlHours));
        response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return await response.ReadAsync<CreateClaimResponse>();
    }

    private static Task<HttpResponseMessage> RedeemAsync(HubApp hub, string client, string token, Party at) =>
        hub.RawAs(client).PostJsonAsync($"/v1/claims/{token}/redeem", new RedeemClaimRequest(at.TenantId!, at.FacilityId!));

    [Fact]
    public async Task A_claim_is_redeemed_once_by_any_facility_of_the_right_type_without_a_partner_link()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var correlation = Guid.NewGuid();
        var order = Order(W.A1Clinic, correlation: correlation);
        var claim = await CreateAsync(hub, "clinic", order);

        (await hub.PullAsync("lab", "laboratory")).Should().BeEmpty("nothing is delivered before somebody redeems");
        var redeem = await RedeemAsync(hub, "lab", claim.Token, W.B1Lab);
        var body = await redeem.ReadAsync<RedeemClaimResponse>();

        body.ClaimId.Should().Be(claim.ClaimId);
        body.CorrelationId.Should().Be(correlation);
        body.MessageId.Should().Be(order.MessageId);
        body.IssuerFacilityId.Should().Be("a-clinic");
        var delivered = (await hub.PullAsync("lab", "laboratory")).Single().Envelope;
        delivered.MessageId.Should().Be(order.MessageId);
        delivered.To.TenantId.Should().Be(W.TenantB);
        delivered.To.FacilityId.Should().Be("b-lab");
        delivered.From.FacilityId.Should().Be("a-clinic");
    }

    [Fact]
    public async Task The_redeemer_may_reply_to_the_private_issuer_on_the_claim_correlation_only()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var correlation = Guid.NewGuid();
        var claim = await CreateAsync(hub, "clinic", Order(W.A1Clinic, correlation: correlation));
        (await RedeemAsync(hub, "lab", claim.Token, W.B1Lab)).StatusCode.Should().Be(HttpStatusCode.OK);

        (await hub.SendAsync("lab", W.Env(InteropTypes.LabOrderStatusChanged, W.B1Lab, W.A1Clinic, correlation))).Status.Should().Be(SendResult.Accepted);
        (await hub.SendAsync("lab", W.Env(InteropTypes.LabResultFinalized, W.B1Lab, W.A1Clinic, correlation))).Status.Should().Be(SendResult.Accepted);
        (await hub.SendAsync("lab", W.Env(InteropTypes.LabResultFinalized, W.B1Lab, W.A1Clinic, Guid.NewGuid()))).Status.Should().Be(SendResult.Rejected);
        (await hub.PullAsync("clinic", "clinic")).Select(m => m.Envelope.Type).Should().Equal(InteropTypes.LabOrderStatusChanged, InteropTypes.LabResultFinalized);
    }

    [Fact]
    public async Task A_second_redeem_conflicts_and_concurrent_redeems_deliver_exactly_once()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var claim = await CreateAsync(hub, "clinic", Order(W.A1Clinic));

        var attempts = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => RedeemAsync(hub, "lab", claim.Token, W.B1Lab)));

        attempts.Count(r => r.StatusCode == HttpStatusCode.OK).Should().Be(1);
        attempts.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(5);
        (await hub.PullAsync("lab", "laboratory")).Should().ContainSingle();
        (await RedeemAsync(hub, "lab", claim.Token, W.B1Lab)).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Unknown_expired_wrong_type_and_foreign_redeemers_are_refused()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var claim = await CreateAsync(hub, "clinic", Order(W.A1Clinic));

        (await RedeemAsync(hub, "lab", "no-such-token", W.B1Lab)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await RedeemAsync(hub, "clinic", claim.Token, W.B2Clinic)).StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await RedeemAsync(hub, "lab", claim.Token, W.E2Lab)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await RedeemAsync(hub, "lab", claim.Token, Party.ForFacility(W.TenantB, "ghost", FacilityType.Laboratory))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await RedeemAsync(hub, "portal", claim.Token, W.B1Lab)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await RedeemAsync(hub, "patient", claim.Token, W.B1Lab)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        hub.Clock.Advance(TimeSpan.FromHours(169));
        (await RedeemAsync(hub, "lab", claim.Token, W.B1Lab)).StatusCode.Should().Be(HttpStatusCode.Gone);
        (await hub.PullAsync("lab", "laboratory")).Should().BeEmpty();
    }

    [Fact]
    public async Task Only_the_token_hash_is_stored_and_the_parked_order_is_cleared_on_redeem()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var claim = await CreateAsync(hub, "clinic", Order(W.A1Clinic));

        var stored = await hub.DbAsync(db => db.Claims.AsNoTracking().SingleAsync());
        stored.TokenHash.Should().HaveLength(64).And.NotContain(claim.Token);
        stored.Envelope.Should().NotBeEmpty().And.NotContain(claim.Token);
        claim.Token.Length.Should().BeGreaterThanOrEqualTo(43);

        (await RedeemAsync(hub, "lab", claim.Token, W.B1Lab)).StatusCode.Should().Be(HttpStatusCode.OK);
        var redeemed = await hub.DbAsync(db => db.Claims.AsNoTracking().SingleAsync());
        redeemed.Envelope.Should().BeEmpty();
        redeemed.RedeemedAtUtc.Should().NotBeNull();
        redeemed.RedeemedByFacilityId.Should().Be("b-lab");
    }

    [Fact]
    public async Task Creating_a_claim_validates_the_issuer_and_the_envelope()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var withFacility = W.Env(InteropTypes.LabOrderIssued, W.A1Clinic, W.A2Lab);
        (await hub.RawAs("clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(withFacility))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await hub.RawAs("clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(Order(W.E1Clinic)))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.RawAs("clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(Order(Party.Portal)))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.RawAs("patient").PostJsonAsync("/v1/claims", new CreateClaimRequest(Order(Party.ForPatient("p1"))))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.RawAs("portal").PostJsonAsync("/v1/claims", new CreateClaimRequest(Order(Party.Portal)))).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var oversize = W.Env(InteropTypes.LabOrderIssued, W.A1Clinic, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Laboratory }, payload: new { blob = new string('x', 9000) });
        (await hub.RawAs("clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(oversize))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await hub.Raw().PostJsonAsync("/v1/claims", new CreateClaimRequest(Order(W.A1Clinic)))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await hub.Raw().PostJsonAsync("/v1/claims/anything/redeem", new RedeemClaimRequest("t", "f"))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_claim_lifetime_is_clamped_to_the_configured_maximum()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var claim = await CreateAsync(hub, "clinic", Order(W.A1Clinic), ttlHours: 100_000);

        var now = hub.Clock.GetUtcNow().UtcDateTime;
        claim.ExpiresAtUtc.Should().BeCloseTo(now.AddHours(720), TimeSpan.FromSeconds(5));
        var defaultTtl = await CreateAsync(hub, "clinic", Order(W.A1Clinic));
        defaultTtl.ExpiresAtUtc.Should().BeCloseTo(now.AddHours(168), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task Maintenance_purges_expired_claims()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await CreateAsync(hub, "clinic", Order(W.A1Clinic));

        hub.Clock.Advance(TimeSpan.FromHours(200));

        (await hub.MaintainAsync()).ClaimsPurged.Should().Be(1);
        (await hub.DbAsync(db => db.Claims.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task A_claim_redeemed_by_an_edge_facility_is_delivered_through_its_cell_inbox()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var order = Order(W.A1Clinic);
        var claim = await CreateAsync(hub, "clinic", order);

        (await RedeemAsync(hub, "edge-hub", claim.Token, W.E2Lab)).StatusCode.Should().Be(HttpStatusCode.OK);

        var inbox = await hub.PullCellInboxAsync();
        inbox.Should().ContainSingle().Which.Envelope.To.FacilityId.Should().Be("e-lab");
        (await hub.MessageRowAsync(order.MessageId)).Mailbox.Should().Be("edge-1:cell-inbox");
    }
}
