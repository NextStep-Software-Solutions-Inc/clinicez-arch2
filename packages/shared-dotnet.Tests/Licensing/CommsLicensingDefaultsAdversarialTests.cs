using System.Text.Json;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Licensing;

/// <summary>
/// Challenger 2 Milestone M1 Adversarial Suite:
/// Empirically verifies licensing entitlement defaults across all tiers in PlanTierDefaults,
/// FacilityLimits, and FacilityFeatureKeys. Ensures that call minutes, workspace chat, and
/// patient messaging are strictly 0 and disabled by default across every tier.
/// </summary>
public class CommsLicensingDefaultsAdversarialTests
{
    [Fact]
    public void FacilityLimits_DefaultInstance_HasZeroCallMinutesMonthly()
    {
        var limits = new FacilityLimits();
        limits.CallMinutesMonthly.Should().Be(0, "default call minutes must be strictly 0 across all unconfigured instances");
    }

    [Theory]
    [InlineData("community")]
    [InlineData("Community")]
    [InlineData("standard")]
    [InlineData("Standard")]
    [InlineData("STANDARD")]
    [InlineData("enterprise")]
    [InlineData("Enterprise")]
    [InlineData("ENTERPRISE")]
    [InlineData("pro")]
    [InlineData("starter")]
    [InlineData("free")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("non-existent-tier-xyz")]
    public void PlanTierDefaults_GetLimitsForTier_AlwaysReturnsZeroCallMinutesMonthly(string? tier)
    {
        var limits = PlanTierDefaults.GetLimitsForTier(tier);

        limits.Should().NotBeNull();
        limits.CallMinutesMonthly.Should().Be(0, $"tier '{tier}' must strictly default to 0 monthly call minutes");
    }

    [Theory]
    [InlineData("community")]
    [InlineData("standard")]
    [InlineData("enterprise")]
    [InlineData("pro")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("unknown")]
    public void PlanTierDefaults_GetFeaturesForTier_NeverIncludesWorkspaceChatOrPatientMessaging(string? tier)
    {
        var features = PlanTierDefaults.GetFeaturesForTier(tier);

        features.Should().NotBeNull();
        features.Should().NotContain(FacilityFeatureKeys.WorkspaceChat,
            $"tier '{tier}' must not have WorkspaceChat enabled by default");
        features.Should().NotContain(FacilityFeatureKeys.PatientMessaging,
            $"tier '{tier}' must not have PatientMessaging enabled by default");
    }

    [Fact]
    public void FacilityFeatureKeys_CommsFeatureConstants_AreWellDefined()
    {
        FacilityFeatureKeys.WorkspaceChat.Should().Be("WorkspaceChat");
        FacilityFeatureKeys.PatientMessaging.Should().Be("PatientMessaging");
    }

    [Fact]
    public void FacilityLimits_JsonSerialization_PreservesZeroCallMinutesDefault()
    {
        var original = new FacilityLimits();
        var json = JsonSerializer.Serialize(original);

        json.Should().Contain("\"callMinutesMonthly\":0");

        var deserialized = JsonSerializer.Deserialize<FacilityLimits>(json);
        deserialized.Should().NotBeNull();
        deserialized!.CallMinutesMonthly.Should().Be(0);
    }

    [Fact]
    public void FacilityLimits_JsonDeserialization_DefaultsMissingCallMinutesToZero()
    {
        var legacyJson = "{\"maxStaff\":10,\"maxMonthlyConsultations\":1000}";
        var limits = JsonSerializer.Deserialize<FacilityLimits>(legacyJson);

        limits.Should().NotBeNull();
        limits!.CallMinutesMonthly.Should().Be(0, "omitted callMinutesMonthly in legacy JSON must default to 0");
    }
}
