using System.Net;
using System.Net.Http.Json;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Tests;

/// <summary>Envelope signatures at the hub boundary: who may send what, and how the keys are published.</summary>
public class SigningTests
{
    private const string Order = InteropTypes.LabOrderIssued;

    private static Dictionary<string, string?> Required => new() { ["Hub:Signing:Required"] = "true" };

    private static bool Verifies(InteropEnvelope envelope, string publicKey)
    {
        using var key = PemKey.ImportEcdsa(PemKey.Normalize(publicKey, "test")!, "test");
        return EnvelopeSigning.Verify(envelope, envelope.Signature!, key);
    }

    // ---- required ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task When_required_an_unsigned_envelope_is_rejected_and_nothing_is_stored()
    {
        await using var hub = await HubApp.StartCloudAsync(Required);

        var result = await hub.SendAsync("clinic", W.Env(Order, W.A1Clinic, W.A2Lab));

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().StartWith("signature_required");
        (await hub.MessageCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task When_required_an_envelope_signed_by_the_sender_is_accepted_and_keeps_its_signature()
    {
        await using var hub = await HubApp.StartCloudAsync(Required);
        var envelope = TestKeys.Sign("clinic", W.Env(Order, W.A1Clinic, W.A2Lab));

        (await hub.SendAsync("clinic", envelope)).Status.Should().Be(SendResult.Accepted);

        var delivered = (await hub.PullAsync("lab", "laboratory")).Single().Envelope;
        delivered.SignerKeyId.Should().Be("clinic");
        delivered.Signature.Should().Be(envelope.Signature);
        Verifies(delivered, TestKeys.For("clinic").PublicKey).Should().BeTrue();
    }

    [Fact]
    public async Task A_tampered_envelope_is_rejected()
    {
        await using var hub = await HubApp.StartCloudAsync(Required);
        var signed = TestKeys.Sign("clinic", W.Env(Order, W.A1Clinic, W.A2Lab));

        var changedCorrelation = signed with { CorrelationId = Guid.NewGuid() };
        var changedRecipient = signed with { To = W.A3Pharmacy };
        var changedPayload = signed with { Payload = System.Text.Json.JsonSerializer.SerializeToElement(new { note = "tampered" }) };

        foreach (var tampered in new[] { changedCorrelation, changedRecipient, changedPayload })
        {
            var result = await hub.SendAsync("clinic", tampered);
            result.Status.Should().Be(SendResult.Rejected);
            result.Reason.Should().StartWith("invalid_signature");
        }

        (await hub.MessageCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task A_signature_from_another_clients_key_is_rejected()
    {
        await using var hub = await HubApp.StartCloudAsync(Required);

        // lab signs a message that claims to be from clinic and is sent by clinic: SignerKeyId is not the sender
        var byLab = TestKeys.Sign("lab", W.Env(Order, W.A1Clinic, W.A2Lab));
        var wrongId = await hub.SendAsync("clinic", byLab);

        // clinic's id but somebody else's key
        var forged = new EnvelopeSigner(PemKey.GenerateP256Base64().PrivateKey, "clinic").Sign(W.Env(Order, W.A1Clinic, W.A2Lab));
        var wrongKey = await hub.SendAsync("clinic", forged);

        wrongId.Status.Should().Be(SendResult.Rejected);
        wrongId.Reason.Should().StartWith("invalid_signature");
        wrongKey.Status.Should().Be(SendResult.Rejected);
        wrongKey.Reason.Should().StartWith("invalid_signature");
    }

    [Fact]
    public async Task A_client_created_by_the_admin_can_send_signed_envelopes_at_once()
    {
        await using var hub = await HubApp.StartCloudAsync(Required);
        var admin = hub.AdminSdk();
        var created = await admin.CreateClientAsync("cloud", new CreateHubClientRequest("laboratory", HubClientKind.CloudService), CancellationToken.None);
        // the hub generated the pair; the client signs with the private half it was handed
        var signer = new EnvelopeSigner(created.SigningKey, created.ClientId);
        var envelope = signer.Sign(W.Env(Order, W.A2Lab, W.A1Clinic));

        var result = (await hub.Sdk(created.ClientId, created.ClientSecret).SendAsync([envelope], CancellationToken.None)).Single();

        result.Status.Should().Be(SendResult.Accepted, result.Reason);
    }

    // ---- not required --------------------------------------------------------------------------------------------

    [Fact]
    public async Task When_not_required_unsigned_is_accepted_but_a_bad_signature_is_still_rejected()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.SendAsync("clinic", W.Env(Order, W.A1Clinic, W.A2Lab))).Status.Should().Be(SendResult.Accepted);

        var bad = TestKeys.Sign("clinic", W.Env(Order, W.A1Clinic, W.A2Lab)) with { Type = InteropTypes.LabResultFinalized };
        var result = await hub.SendAsync("clinic", bad);
        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().StartWith("invalid_signature");
    }

    // ---- keys endpoint ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task The_keys_endpoint_publishes_the_registered_public_key_and_404s_for_unknown_clients()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var found = await hub.RawAs("lab").GetAsync("/v1/keys/clinic");
        var key = await found.ReadAsync<HubSignerKey>();
        key.ClientId.Should().Be("clinic");
        key.Revoked.Should().BeFalse();
        PemKey.Normalize(key.PublicKey, "k").Should().Be(PemKey.Normalize(TestKeys.For("clinic").PublicKey, "k"));
        key.PublicKey.Should().NotContain("PRIVATE");

        (await hub.RawAs("lab").GetAsync("/v1/keys/ghost")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await hub.Raw().GetAsync("/v1/keys/clinic")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Created_clients_get_a_generated_pair_whose_private_half_is_returned_once()
    {
        await using var hub = await HubApp.StartCloudAsync(Required);
        var admin = hub.AdminSdk();

        var created = await admin.CreateClientAsync("cloud", new CreateHubClientRequest("laboratory", HubClientKind.CloudService), CancellationToken.None);

        created.SigningKey.Should().NotBeNullOrWhiteSpace();
        var published = await (await hub.RawAs("clinic").GetAsync($"/v1/keys/{created.ClientId}")).ReadAsync<HubSignerKey>();
        published.PublicKey.Should().NotBeNullOrWhiteSpace().And.NotContain("PRIVATE");
        PemKey.DerivePublicPem(PemKey.Normalize(created.SigningKey, "k")!, "k").Should().Be(PemKey.Normalize(published.PublicKey, "k"));
        var signed = new EnvelopeSigner(created.SigningKey, created.ClientId).Sign(W.Env(Order, W.A2Lab, W.A1Clinic));
        Verifies(signed, published.PublicKey!).Should().BeTrue();

        var rotated = await admin.RotateClientAsync(created.ClientId, CancellationToken.None);
        rotated.SigningKey.Should().NotBe(created.SigningKey);
        var republished = await (await hub.RawAs("clinic").GetAsync($"/v1/keys/{created.ClientId}")).ReadAsync<HubSignerKey>();
        republished.PublicKey.Should().NotBe(published.PublicKey);
        Verifies(signed, republished.PublicKey!).Should().BeFalse("the old private key no longer matches");
    }

    [Fact]
    public async Task A_caller_supplied_public_key_is_registered_as_is_and_a_private_key_is_refused()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var admin = hub.AdminSdk();
        var pair = PemKey.GenerateP256Base64();

        var created = await admin.CreateClientAsync("cloud", new CreateHubClientRequest("laboratory", HubClientKind.CloudService, pair.PublicKey), CancellationToken.None);

        created.SigningKey.Should().BeNull("the hub never sees a private key the caller keeps");
        var published = await (await hub.RawAs("clinic").GetAsync($"/v1/keys/{created.ClientId}")).ReadAsync<HubSignerKey>();
        PemKey.Normalize(published.PublicKey, "k").Should().Be(PemKey.Normalize(pair.PublicKey, "k"));

        var privateAsPublic = () => admin.CreateClientAsync("cloud", new CreateHubClientRequest("pharmacy", HubClientKind.CloudService, pair.PrivateKey), CancellationToken.None);
        await privateAsPublic.Should().ThrowAsync<Exception>();
        var garbage = () => admin.CreateClientAsync("cloud", new CreateHubClientRequest("pharmacy", HubClientKind.CloudService, "not a key"), CancellationToken.None);
        await garbage.Should().ThrowAsync<Exception>();
    }

    [Fact]
    public async Task A_revoked_client_is_published_as_revoked()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var admin = hub.AdminSdk();
        var created = await admin.CreateClientAsync("cloud", new CreateHubClientRequest("laboratory", HubClientKind.CloudService), CancellationToken.None);

        await admin.RevokeClientAsync(created.ClientId, CancellationToken.None);

        var published = await (await hub.RawAs("clinic").GetAsync($"/v1/keys/{created.ClientId}")).ReadAsync<HubSignerKey>();
        published.Revoked.Should().BeTrue();
    }

    [Fact]
    public async Task The_SDK_verifier_accepts_what_the_hub_delivers_and_rejects_a_changed_copy()
    {
        await using var hub = await HubApp.StartCloudAsync(Required);
        var envelope = TestKeys.Sign("clinic", W.Env(Order, W.A1Clinic, W.A2Lab));
        (await hub.SendAsync("clinic", envelope)).Status.Should().Be(SendResult.Accepted);
        var delivered = (await hub.PullAsync("lab", "laboratory")).Single().Envelope;

        var sdk = hub.Sdk("lab");
        var verifier = new EnvelopeVerifier(Options.Create(new InteropOptions { VerifyInbound = true }), new StubEnvironment("Production"));

        (await verifier.VerifyAsync(sdk, delivered, CancellationToken.None)).Should().BeNull();
        (await verifier.VerifyAsync(sdk, delivered with { To = W.A3Pharmacy }, CancellationToken.None)).Should().StartWith("invalid_signature");
        (await verifier.VerifyAsync(sdk, delivered with { Signature = null }, CancellationToken.None)).Should().StartWith("invalid_signature");
        (await verifier.VerifyAsync(sdk, delivered with { SignerKeyId = "ghost" }, CancellationToken.None)).Should().StartWith("invalid_signature");
    }

    // ---- claims ----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task Claims_require_a_signed_envelope_and_a_redeemed_copy_verifies_against_the_issuer_key_through_SignedTo()
    {
        await using var hub = await HubApp.StartCloudAsync(Required);
        var order = W.Env(Order, W.A1Clinic, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Laboratory });

        var unsigned = await hub.RawAs("clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(order));
        unsigned.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await unsigned.Content.ReadAsStringAsync()).Should().Contain("signature_required");

        var created = await (await hub.RawAs("clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(TestKeys.Sign("clinic", order)))).ReadAsync<CreateClaimResponse>();
        (await hub.RawAs("lab").PostJsonAsync($"/v1/claims/{created.Token}/redeem", new RedeemClaimRequest(W.B1Lab.TenantId!, W.B1Lab.FacilityId!)))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var delivered = (await hub.PullAsync("lab", "laboratory")).Single().Envelope;
        delivered.To.FacilityId.Should().Be("b-lab", "redeem rewrites the recipient");
        delivered.SignedTo.Should().NotBeNull("the signature covers the recipient as the issuer wrote it");
        delivered.SignedTo!.FacilityId.Should().BeNull();
        Verifies(delivered, TestKeys.For("clinic").PublicKey).Should().BeTrue();
    }

    // ---- federation ------------------------------------------------------------------------------------------------

    [Fact]
    public async Task An_edge_hub_re_signs_forwarded_envelopes_with_its_upstream_key_and_the_cloud_accepts_them()
    {
        await using var f = await Federation.StartAsync(requireSigning: true);
        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.E1Clinic, W.B1Lab);

        var unsigned = await f.Local.SendAsync("local-clinic", W.Env(Order, W.E1Clinic, W.B1Lab));
        unsigned.Status.Should().Be(SendResult.Rejected);
        unsigned.Reason.Should().StartWith("signature_required");

        var envelope = TestKeys.Sign("local-clinic", W.Env(Order, W.E1Clinic, W.B1Lab));
        (await f.Local.SendAsync("local-clinic", envelope)).Status.Should().Be(SendResult.Accepted);
        (await f.ForwardAsync()).Should().Be(1);

        var delivered = (await f.Cloud.PullAsync("lab", "laboratory")).Single().Envelope;
        delivered.MessageId.Should().Be(envelope.MessageId);
        delivered.SignerKeyId.Should().Be("edge-hub");
        Verifies(delivered, TestKeys.For("edge-hub").PublicKey).Should().BeTrue();
    }

    [Fact]
    public async Task A_local_hub_answers_key_lookups_for_cloud_signers_through_the_upstream()
    {
        await using var f = await Federation.StartAsync();

        var local = await (await f.Local.RawAs("local-clinic").GetAsync("/v1/keys/lab")).ReadAsync<HubSignerKey>();
        PemKey.Normalize(local.PublicKey, "k").Should().Be(PemKey.Normalize(TestKeys.For("lab").PublicKey, "k"));

        (await f.Local.RawAs("local-clinic").GetAsync("/v1/keys/ghost")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task A_local_claim_proxy_verifies_the_facility_signature_before_forwarding()
    {
        await using var f = await Federation.StartAsync(requireSigning: true);
        var order = W.Env(Order, W.E1Clinic, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Laboratory });

        var unsigned = await f.Local.RawAs("local-clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(order));
        unsigned.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var signed = await f.Local.RawAs("local-clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(TestKeys.Sign("local-clinic", order)));
        signed.StatusCode.Should().Be(HttpStatusCode.Created, await signed.Content.ReadAsStringAsync());
    }

    private sealed class StubEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}

/// <summary>The hub's own persistence model and wire format follow the strict-string-enum rule.</summary>
public class StrictEnumTests
{
    [Fact]
    public async Task No_hub_entity_property_is_stored_as_a_number()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var offenders = await hub.DbAsync(db => Task.FromResult(StringEnumModel.FindNonStringEnumProperties(db.Model)));

        offenders.Should().BeEmpty();
    }

    [Fact]
    public async Task A_numeric_enum_on_the_wire_is_a_client_error()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var response = await hub.RawAs("portal").PostAsJsonAsync("/v1/admin/cells/cloud/clients", new { service = "laboratory", kind = 1 });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
