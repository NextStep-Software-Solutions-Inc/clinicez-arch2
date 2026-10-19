using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Sharing;
using FluentAssertions;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Application.Tests.Features.Sharing;

public sealed class ShareCodeServiceTests
{
    private const string Key = "unit-test-signing-key-unit-test-signing-key";

    private static ShareCodeService CreateService(string key = Key) =>
        new(Options.Create(new SharingOptions { SigningKey = key }));

    [Fact]
    public void Generated_codes_are_eight_unambiguous_characters_and_survive_normalization()
    {
        var service = CreateService();

        for (var i = 0; i < 200; i++)
        {
            var code = service.Generate();

            code.Should().HaveLength(ShareCodeService.CodeLength);
            code.Should().MatchRegex("^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$");
            service.Normalize(code).Should().Be(code);
        }
    }

    [Fact]
    public void Generated_codes_differ()
    {
        var service = CreateService();

        Enumerable.Range(0, 50).Select(_ => service.Generate()).Distinct().Should().HaveCountGreaterThan(45);
    }

    [Theory]
    [InlineData("abcd-2345", "ABCD2345")]
    [InlineData("  ABCD 2345  ", "ABCD2345")]
    [InlineData("AbCd2345", "ABCD2345")]
    public void Normalize_ignores_case_spaces_and_hyphens(string typed, string expected) =>
        CreateService().Normalize(typed).Should().Be(expected);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("ABCD234")]
    [InlineData("ABCD23456")]
    [InlineData("ABCD-0123")]
    [InlineData("ABCD-I1LO")]
    [InlineData("ABCD-23!5")]
    public void Normalize_rejects_malformed_codes(string? typed) =>
        CreateService().Normalize(typed).Should().BeNull();

    [Fact]
    public void Format_groups_in_fours() =>
        CreateService().Format("ABCD2345").Should().Be("ABCD-2345");

    [Fact]
    public void Hash_is_stable_and_bound_to_the_patient_and_the_key()
    {
        var service = CreateService();
        var patientId = Guid.NewGuid();

        var hash = service.Hash(patientId, "ABCD2345");

        hash.Should().Be(service.Hash(patientId, "ABCD2345"));
        hash.Should().NotBe(service.Hash(Guid.NewGuid(), "ABCD2345"));
        hash.Should().NotBe(service.Hash(patientId, "ABCD2346"));
        hash.Should().NotBe(CreateService("another-unit-test-signing-key-another-key").Hash(patientId, "ABCD2345"));
        hash.Should().NotContain("ABCD2345");
    }

    [Fact]
    public void A_short_signing_key_is_rejected()
    {
        var act = () => CreateService("short");

        act.Should().Throw<InvalidOperationException>();
    }
}
