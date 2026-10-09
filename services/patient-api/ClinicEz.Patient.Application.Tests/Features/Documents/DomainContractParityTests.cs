using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;

namespace ClinicEz.Patient.Application.Tests.Features.Documents;

public sealed class DomainContractParityTests
{
    [Fact]
    public void Lab_slip_stages_match_the_shared_lab_order_stages() =>
        Enum.GetNames<LabSlipStage>().Should().Equal(Enum.GetNames<LabOrderStage>());

    [Fact]
    public void Prescription_stages_match_the_shared_rx_stages() =>
        Enum.GetNames<PrescriptionStage>().Should().Equal(Enum.GetNames<RxStage>());

    [Fact]
    public void Result_provenance_matches_the_shared_result_source() =>
        Enum.GetNames<ResultProvenance>().Should().Equal(Enum.GetNames<ResultSource>());

    [Fact]
    public void Result_verification_matches_the_shared_verification_state() =>
        Enum.GetNames<ResultVerification>().Should().Equal(Enum.GetNames<VerificationState>());

    [Fact]
    public void Access_scopes_match_the_shared_sharing_scopes_name_for_name_and_value() =>
        Enum.GetValues<AccessScopes>().ToDictionary(v => v.ToString(), v => (int)v)
            .Should().BeEquivalentTo(Enum.GetValues<SharingScopes>().ToDictionary(v => v.ToString(), v => (int)v));
}

public sealed class ClinicEzIdGeneratorTests
{
    [Fact]
    public void Ids_are_short_readable_and_avoid_confusable_letters()
    {
        for (var i = 0; i < 200; i++)
            ClinicEzIdGenerator.Generate().Should().MatchRegex("^CE-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$");
    }

    [Fact]
    public void Ids_do_not_repeat_in_a_realistic_sample()
    {
        var ids = Enumerable.Range(0, 5000).Select(_ => ClinicEzIdGenerator.Generate()).ToList();

        ids.Should().OnlyHaveUniqueItems();
    }
}
