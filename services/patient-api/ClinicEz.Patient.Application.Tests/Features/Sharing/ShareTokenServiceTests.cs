using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Application.Tests.Features.Sharing;

internal sealed class ManualTimeProvider : TimeProvider
{
    private DateTimeOffset _now;

    public ManualTimeProvider(DateTimeOffset? start = null) => _now = start ?? new DateTimeOffset(2026, 10, 9, 8, 0, 0, TimeSpan.Zero);

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}

public sealed class ShareTokenServiceTests
{
    private const string Key = "unit-test-signing-key-unit-test-signing-key";

    private readonly ManualTimeProvider _clock = new();

    private ShareTokenService CreateService(string key = Key, int ttlSeconds = 120) =>
        new(Options.Create(new SharingOptions { SigningKey = key, ShareTokenTtlSeconds = ttlSeconds }), _clock);

    [Fact]
    public void An_issued_token_validates_and_carries_what_the_patient_chose()
    {
        var service = CreateService();
        var patientId = Guid.NewGuid();

        var issued = service.Issue(patientId, SharingScopes.Allergies | SharingScopes.Vitals, "Consultation");
        var result = service.Validate(issued.Value);

        result.IsValid.Should().BeTrue();
        result.Claims!.PatientId.Should().Be(patientId);
        result.Claims.Scopes.Should().Be(SharingScopes.Allergies | SharingScopes.Vitals);
        result.Claims.Purpose.Should().Be("Consultation");
        result.Claims.TokenId.Should().Be(issued.TokenId);
        issued.ExpiresAtUtc.Should().Be(_clock.GetUtcNow().UtcDateTime.AddSeconds(120));
    }

    [Fact]
    public void Every_token_has_its_own_id()
    {
        var service = CreateService();

        var first = service.Issue(Guid.NewGuid(), SharingScopes.All, "Consultation");
        var second = service.Issue(Guid.NewGuid(), SharingScopes.All, "Consultation");

        first.TokenId.Should().NotBe(second.TokenId);
    }

    [Fact]
    public void A_token_expires_at_its_ttl()
    {
        var service = CreateService(ttlSeconds: 120);
        var issued = service.Issue(Guid.NewGuid(), SharingScopes.Demographics, "Consultation");

        _clock.Advance(TimeSpan.FromSeconds(119));
        service.Validate(issued.Value).IsValid.Should().BeTrue();

        _clock.Advance(TimeSpan.FromSeconds(1));
        service.Validate(issued.Value).Failure.Should().Be(ShareTokenFailure.Expired);
    }

    [Fact]
    public void A_token_signed_with_another_key_is_rejected()
    {
        var token = CreateService("another-signing-key-another-signing-key-0").Issue(Guid.NewGuid(), SharingScopes.All, "Consultation");

        CreateService().Validate(token.Value).Failure.Should().Be(ShareTokenFailure.BadSignature);
    }

    [Fact]
    public void A_token_whose_payload_was_altered_is_rejected()
    {
        var service = CreateService();
        var original = service.Issue(Guid.NewGuid(), SharingScopes.Demographics, "Consultation").Value;
        var other = service.Issue(Guid.NewGuid(), SharingScopes.All, "Consultation").Value;
        var forged = other.Split('.')[0] + "." + original.Split('.')[1];

        service.Validate(forged).Failure.Should().Be(ShareTokenFailure.BadSignature);
    }

    [Theory]
    [InlineData("")]
    [InlineData("no-dot")]
    [InlineData("a.b.c")]
    [InlineData(".")]
    [InlineData("abc.***")]
    public void Malformed_tokens_are_rejected_without_throwing(string token)
    {
        var failure = CreateService().Validate(token).Failure;

        failure.Should().BeOneOf(ShareTokenFailure.Malformed, ShareTokenFailure.BadSignature);
    }

    [Fact]
    public void A_missing_or_short_signing_key_refuses_to_start()
    {
        var empty = () => CreateService(string.Empty);
        var tooShort = () => CreateService(new string('k', SharingOptions.MinimumSigningKeyLength - 1));

        empty.Should().Throw<InvalidOperationException>();
        tooShort.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Scope_names_round_trip_and_unknown_names_are_refused()
    {
        SharingScopeMap.TryParse(["demographics", "labResults", "LABRESULTS"], out var scopes).Should().BeTrue();
        scopes.Should().Be(SharingScopes.Demographics | SharingScopes.LabResults);
        SharingScopeMap.ToNames(scopes).Should().Equal("demographics", "labResults");

        SharingScopeMap.TryParse(["demographics", "bank-account"], out _).Should().BeFalse();
        SharingScopeMap.TryParse([], out _).Should().BeFalse();
    }

    [Fact]
    public void Every_scope_of_the_contract_has_an_api_name()
    {
        var all = Enum.GetValues<SharingScopes>().Where(s => s is not (SharingScopes.None or SharingScopes.All));

        SharingScopeMap.ToNames(SharingScopes.All).Should().HaveCount(all.Count());
    }
}
