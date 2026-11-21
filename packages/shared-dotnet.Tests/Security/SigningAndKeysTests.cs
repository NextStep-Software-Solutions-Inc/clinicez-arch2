using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Tests.Security;

internal sealed class FakeEnvironment(string name) : IHostEnvironment
{
    public string EnvironmentName { get; set; } = name;
    public string ApplicationName { get; set; } = "tests";
    public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();

    public static FakeEnvironment Production => new(Environments.Production);
    public static FakeEnvironment Development => new(Environments.Development);
}

public class PemKeyTests
{
    [Fact]
    public void Pem_base64_of_pem_and_escaped_newlines_all_normalize_to_the_same_key()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var pem = ecdsa.ExportECPrivateKeyPem();
        var base64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(pem));
        var escaped = pem.Trim().Replace("\r\n", "\n").Replace("\n", "\\n");

        var fromPem = PemKey.Normalize(pem, "k");
        PemKey.Normalize(base64, "k").Should().Be(fromPem);
        PemKey.Normalize(escaped, "k").Should().Be(fromPem);
        PemKey.Normalize("  ", "k").Should().BeNull();
        PemKey.Normalize(null, "k").Should().BeNull();
    }

    [Fact]
    public void Garbage_and_non_P256_keys_are_refused_with_the_setting_name()
    {
        var garbage = () => PemKey.ImportEcdsa(PemKey.Normalize("definitely not a key", "My:Setting") ?? "x", "My:Setting");
        garbage.Should().Throw<Exception>().WithMessage("*My:Setting*");

        using var p384 = ECDsa.Create(ECCurve.NamedCurves.nistP384);
        var wrongCurve = () => PemKey.ImportEcdsa(p384.ExportECPrivateKeyPem(), "My:Setting");
        wrongCurve.Should().Throw<Exception>().WithMessage("*P-256*");
    }

    [Fact]
    public void Generated_pairs_match_and_the_public_half_is_derived_from_the_private_half()
    {
        var pair = PemKey.GenerateP256Base64();

        PemKey.DerivePublicPem(PemKey.Normalize(pair.PrivateKey, "k")!, "k").Should().Be(PemKey.Normalize(pair.PublicKey, "k"));
        PemKey.Normalize(pair.PublicKey, "k").Should().NotContain("PRIVATE");
    }
}

public class EnvelopeSigningTests
{
    private static readonly Party Clinic = Party.ForFacility("tenant-a", "clinic-1", FacilityType.Clinic);
    private static readonly Party Lab = Party.ForFacility("tenant-a", "lab-1", FacilityType.Laboratory);

    private static InteropEnvelope Envelope(object? payload = null) =>
        InteropEnvelope.Create("test.ping", Clinic, Lab, Guid.NewGuid(), payload ?? new { text = "hi", n = 3, nested = new { b = 1, a = 2 } });

    private static (EnvelopeSigner Signer, ECDsa Public) Pair(string id)
    {
        var pair = PemKey.GenerateP256Base64();
        return (new EnvelopeSigner(pair.PrivateKey, id), PemKey.ImportEcdsa(PemKey.Normalize(pair.PublicKey, "k")!, "k"));
    }

    [Fact]
    public void A_signed_envelope_verifies_and_survives_reserialization()
    {
        var (signer, key) = Pair("clinic");
        var signed = signer.Sign(Envelope());

        EnvelopeSigning.Verify(signed, signed.Signature!, key).Should().BeTrue();
        signed.SignerKeyId.Should().Be("clinic");

        var roundTripped = JsonSerializer.Deserialize<InteropEnvelope>(JsonSerializer.Serialize(signed, InteropJson.Options), InteropJson.Options)!;
        EnvelopeSigning.Verify(roundTripped, roundTripped.Signature!, key).Should().BeTrue();
    }

    [Fact]
    public void Payload_property_order_and_whitespace_do_not_matter()
    {
        var (signer, key) = Pair("clinic");
        var signed = signer.Sign(Envelope(new { b = 1, a = new[] { 1, 2 } }));

        var reordered = signed with { Payload = JsonDocument.Parse("{ \"a\" : [1,2],\n \"b\":1 }").RootElement.Clone() };

        EnvelopeSigning.Verify(reordered, signed.Signature!, key).Should().BeTrue();
    }

    [Fact]
    public void Every_signed_field_is_covered()
    {
        var (signer, key) = Pair("clinic");
        var signed = signer.Sign(Envelope());
        var other = Party.ForFacility("tenant-b", "lab-9", FacilityType.Laboratory);

        var tampered = new Dictionary<string, InteropEnvelope>
        {
            ["MessageId"] = signed with { MessageId = Guid.NewGuid() },
            ["CorrelationId"] = signed with { CorrelationId = Guid.NewGuid() },
            ["Type"] = signed with { Type = "test.other" },
            ["SchemaVersion"] = signed with { SchemaVersion = signed.SchemaVersion + 1 },
            ["From"] = signed with { From = other },
            ["To"] = signed with { To = other },
            ["SentAtUtc"] = signed with { SentAtUtc = signed.SentAtUtc.AddSeconds(1) },
            ["ExpiresAtUtc"] = signed with { ExpiresAtUtc = DateTime.UtcNow.AddDays(1) },
            ["Payload"] = signed with { Payload = JsonSerializer.SerializeToElement(new { text = "changed" }) },
            ["SignerKeyId"] = signed with { SignerKeyId = "someone-else" },
            ["SignedTo"] = signed with { SignedTo = other }
        };

        foreach (var (field, envelope) in tampered)
            EnvelopeSigning.Verify(envelope, signed.Signature!, key).Should().BeFalse($"changing {field} must break the signature");
    }

    [Fact]
    public void A_signature_over_SignedTo_survives_the_hub_rewriting_To()
    {
        var (signer, key) = Pair("clinic");
        var open = InteropEnvelope.Create("test.ping", Clinic, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Laboratory }, Guid.NewGuid(), new { x = 1 });
        var signed = signer.Sign(open);

        var redeemed = signed with { SignedTo = signed.To, To = Lab };

        EnvelopeSigning.Verify(redeemed, signed.Signature!, key).Should().BeTrue();
        EnvelopeSigning.Verify(signed with { To = Lab }, signed.Signature!, key).Should().BeFalse("without SignedTo the rewritten recipient is a tamper");
    }

    [Fact]
    public void Garbage_signatures_are_false_not_exceptions()
    {
        var (signer, key) = Pair("clinic");
        var signed = signer.Sign(Envelope());

        EnvelopeSigning.Verify(signed, "%%%not-base64%%%", key).Should().BeFalse();
        EnvelopeSigning.Verify(signed, Convert.ToBase64String(new byte[10]), key).Should().BeFalse();
        EnvelopeSigning.Verify(signed, string.Empty, key).Should().BeFalse();
    }

    [Fact]
    public void A_signer_without_a_key_passes_envelopes_through_and_needs_a_key_id_otherwise()
    {
        var unsigned = Envelope();
        new EnvelopeSigner(null, null).Sign(unsigned).Should().Be(unsigned);

        var create = () => new EnvelopeSigner(PemKey.GenerateP256Base64().PrivateKey, " ");
        create.Should().Throw<ArgumentException>();
    }

    [Fact]
    public async Task The_verifier_is_off_in_development_and_on_elsewhere_and_refuses_unsigned_messages()
    {
        var hub = new KeyOnlyHub();
        var production = new EnvelopeVerifier(global::Microsoft.Extensions.Options.Options.Create(new InteropOptions { Transport = "Hub" }), FakeEnvironment.Production);
        var development = new EnvelopeVerifier(global::Microsoft.Extensions.Options.Options.Create(new InteropOptions { Transport = "Hub" }), FakeEnvironment.Development);
        var forcedOn = new EnvelopeVerifier(global::Microsoft.Extensions.Options.Options.Create(new InteropOptions { Transport = "Hub", VerifyInbound = true }), FakeEnvironment.Development);
        var inProcess = new EnvelopeVerifier(global::Microsoft.Extensions.Options.Options.Create(new InteropOptions { Transport = "InProcess" }), FakeEnvironment.Production);

        production.Enabled.Should().BeTrue();
        development.Enabled.Should().BeFalse();
        forcedOn.Enabled.Should().BeTrue();
        inProcess.Enabled.Should().BeFalse();

        (await production.VerifyAsync(hub, Envelope(), default)).Should().StartWith("invalid_signature");
        (await development.VerifyAsync(hub, Envelope(), default)).Should().BeNull();
    }

    [Fact]
    public async Task The_verifier_looks_a_signers_key_up_once_and_re_reads_it_after_a_rotation()
    {
        var first = PemKey.GenerateP256Base64();
        var second = PemKey.GenerateP256Base64();
        var hub = new KeyOnlyHub { Key = new HubSignerKey("clinic", "cloud", "clinic", HubClientKind.CloudService, first.PublicKey, false) };
        var verifier = new EnvelopeVerifier(global::Microsoft.Extensions.Options.Options.Create(new InteropOptions { Transport = "Hub" }), FakeEnvironment.Production);
        var signedFirst = new EnvelopeSigner(first.PrivateKey, "clinic").Sign(Envelope());
        var signedSecond = new EnvelopeSigner(second.PrivateKey, "clinic").Sign(Envelope());

        (await verifier.VerifyAsync(hub, signedFirst, default)).Should().BeNull();
        (await verifier.VerifyAsync(hub, signedFirst, default)).Should().BeNull();
        hub.Lookups.Should().Be(1, "known keys are cached");

        hub.Key = hub.Key with { PublicKey = second.PublicKey };
        (await verifier.VerifyAsync(hub, signedSecond, default)).Should().BeNull("a mismatch triggers one fresh lookup");
        hub.Lookups.Should().Be(2);

        // Revocation is picked up when the cached copy expires (5 minutes), so a fresh verifier sees it at once.
        hub.Key = hub.Key with { Revoked = true };
        var fresh = new EnvelopeVerifier(global::Microsoft.Extensions.Options.Options.Create(new InteropOptions { Transport = "Hub" }), FakeEnvironment.Production);
        (await fresh.VerifyAsync(hub, signedSecond, default)).Should().Contain("revoked");
    }

    private sealed class KeyOnlyHub : IHubClient, IHubKeyClient
    {
        public HubSignerKey? Key { get; set; }
        public int Lookups { get; private set; }

        public Task<HubSignerKey?> GetSignerKeyAsync(string clientId, CancellationToken ct)
        {
            Lookups++;
            return Task.FromResult(Key);
        }

        public Task<IReadOnlyList<SendResult>> SendAsync(IReadOnlyList<InteropEnvelope> envelopes, CancellationToken ct) => throw new NotSupportedException();

        public Task<IReadOnlyList<PulledMessage>> PullAsync(string service, int max, int waitSeconds, CancellationToken ct) => throw new NotSupportedException();

        public Task AckAsync(IReadOnlyList<Guid> deliveryIds, CancellationToken ct) => throw new NotSupportedException();

        public Task NackAsync(IReadOnlyList<NackItem> items, CancellationToken ct) => throw new NotSupportedException();
    }
}

public class LicenseKeyConfigurationTests
{
    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => v.Value)).Build();

    private static FacilityLicensePayload Payload(Guid facilityId) => new() { FacilityId = facilityId, TenantId = "tenant-a", FacilityName = "Lab", FacilityType = "Laboratory" };

    [Fact]
    public void Outside_development_missing_keys_fail_closed_with_a_pointer_to_the_setting()
    {
        var signer = () => new FacilityLicenseSigner(Config(), FakeEnvironment.Production);
        var validator = () => new FacilityLicenseValidator(Config(), FakeEnvironment.Production);

        signer.Should().Throw<InvalidOperationException>().WithMessage("*FacilityLicense:PrivateKeyPem*");
        validator.Should().Throw<InvalidOperationException>().WithMessage("*FacilityLicense:PublicKeyPem*");
    }

    [Fact]
    public void Configured_base64_keys_sign_and_validate_and_a_foreign_authority_is_tampered()
    {
        var pair = PemKey.GenerateP256Base64();
        var facility = Guid.NewGuid();
        var signer = new FacilityLicenseSigner(Config(("FacilityLicense:PrivateKeyPem", pair.PrivateKey)), FakeEnvironment.Production);
        var validator = new FacilityLicenseValidator(Config(("FacilityLicense:PublicKeyPem", pair.PublicKey)), FakeEnvironment.Production);
        var token = signer.SignLicense(Payload(facility));

        validator.Validate(token, facility, "tenant-a").IsValid.Should().BeTrue();

        var stranger = PemKey.GenerateP256Base64();
        var strangerValidator = new FacilityLicenseValidator(Config(("FacilityLicense:PublicKeyPem", stranger.PublicKey)), FakeEnvironment.Production);
        strangerValidator.Validate(token, facility, "tenant-a").IsTampered.Should().BeTrue();
    }

    [Fact]
    public void The_previous_public_key_is_accepted_during_a_rotation()
    {
        var oldPair = PemKey.GenerateP256Base64();
        var newPair = PemKey.GenerateP256Base64();
        var facility = Guid.NewGuid();
        var oldToken = new FacilityLicenseSigner(Config(("FacilityLicense:PrivateKeyPem", oldPair.PrivateKey)), FakeEnvironment.Production).SignLicense(Payload(facility));

        var overlapping = new FacilityLicenseValidator(
            Config(("FacilityLicense:PublicKeyPem", newPair.PublicKey), ("FacilityLicense:PreviousPublicKeyPem", oldPair.PublicKey)),
            FakeEnvironment.Production);
        var afterOverlap = new FacilityLicenseValidator(Config(("FacilityLicense:PublicKeyPem", newPair.PublicKey)), FakeEnvironment.Production);

        overlapping.Validate(oldToken, facility, "tenant-a").IsValid.Should().BeTrue();
        afterOverlap.Validate(oldToken, facility, "tenant-a").IsValid.Should().BeFalse();
    }

    [Fact]
    public void Development_uses_a_per_machine_key_and_signer_and_validator_agree()
    {
        var facility = Guid.NewGuid();
        var signer = new FacilityLicenseSigner(Config(), FakeEnvironment.Development);
        var validator = new FacilityLicenseValidator(Config(), FakeEnvironment.Development);

        validator.Validate(signer.SignLicense(Payload(facility)), facility, "tenant-a").IsValid.Should().BeTrue();
    }

    [Fact]
    public void A_malformed_configured_key_is_a_startup_error_even_in_development()
    {
        var bad = () => new FacilityLicenseValidator(Config(("FacilityLicense:PublicKeyPem", "garbage")), FakeEnvironment.Development);

        bad.Should().Throw<Exception>();
    }

    [Fact]
    public void The_document_signing_key_has_no_built_in_fallback_outside_development()
    {
        var missing = () => new DocumentSecurityService(null, FakeEnvironment.Production);
        missing.Should().Throw<InvalidOperationException>();

        var configured = () => new DocumentSecurityService(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)), FakeEnvironment.Production);
        configured.Should().NotThrow();

        var development = () => new DocumentSecurityService(null, FakeEnvironment.Development);
        development.Should().NotThrow();
    }

    [Fact]
    public async Task The_startup_check_fails_a_hub_service_without_a_signing_key_outside_development()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(FakeEnvironment.Production);
        services.AddSingleton<IConfiguration>(Config(("FacilityLicense:PublicKeyPem", PemKey.GenerateP256Base64().PublicKey)));
        services.AddSingleton<IFacilityLicenseValidator>(sp => new FacilityLicenseValidator(sp.GetRequiredService<IConfiguration>(), sp.GetRequiredService<IHostEnvironment>()));
        services.AddSingleton<global::Microsoft.Extensions.Options.IOptions<InteropOptions>>(global::Microsoft.Extensions.Options.Options.Create(new InteropOptions { Transport = "Hub", HubUrl = "http://hub", ClientId = "x", ClientSecret = "y" }));
        var check = ActivatorUtilities.CreateInstance(services.BuildServiceProvider(), typeof(InteropOptions).Assembly.GetType("ClinicEz.Shared.Interop.InteropStartupCheck")!) as IHostedService;

        var start = () => check!.StartAsync(default);

        (await start.Should().ThrowAsync<InvalidOperationException>()).WithMessage("*Messaging:SigningKey*");
    }
}

public class StrictStringEnumTests
{
    private sealed record Holder(FacilityType Type);

    [Fact]
    public void Names_round_trip_as_strings_and_numbers_are_rejected_on_read_and_write()
    {
        var options = new JsonSerializerOptions().UseStrictStringEnums();

        JsonSerializer.Serialize(new Holder(FacilityType.Laboratory), options).Should().Be("{\"Type\":\"Laboratory\"}");
        JsonSerializer.Deserialize<Holder>("{\"Type\":\"Pharmacy\"}", options)!.Type.Should().Be(FacilityType.Pharmacy);

        var numeric = () => JsonSerializer.Deserialize<Holder>("{\"Type\":1}", options);
        var numericString = () => JsonSerializer.Deserialize<Holder>("{\"Type\":\"1\"}", options);
        var unknown = () => JsonSerializer.Deserialize<Holder>("{\"Type\":\"Imaging\"}", options);
        var undefined = () => JsonSerializer.Serialize(new Holder((FacilityType)99), options);

        numeric.Should().Throw<JsonException>();
        numericString.Should().Throw<JsonException>();
        unknown.Should().Throw<JsonException>();
        undefined.Should().Throw<JsonException>();
    }

    [Fact]
    public void Shared_enums_carry_the_strict_converter_at_type_level()
    {
        var enums = typeof(FacilityType).Assembly.GetTypes().Where(t => t.IsEnum && t.IsPublic && t.Namespace?.StartsWith("ClinicEz.Shared") == true
                                                           && t.Namespace != "ClinicEz.Shared.Interop.Handling"); // in-process dispatch outcomes never cross the wire

        foreach (var enumType in enums)
        {
            var attribute = enumType.GetCustomAttributes(typeof(JsonConverterAttribute), false).Cast<JsonConverterAttribute>().SingleOrDefault();
            attribute.Should().NotBeNull($"{enumType.Name} must be a string enum on the wire");
            attribute!.ConverterType.Should().Be(typeof(StrictJsonStringEnumConverter), enumType.Name);
        }
    }
}
