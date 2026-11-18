using ClinicEz.Patient.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Governance;

public sealed class ClinicTwoTierGovernanceTests
{
    [Fact]
    public void NewClinic_DefaultsToPrivateAndNotEligible()
    {
        var clinic = new Clinic();

        clinic.IsWorkspaceEligible.Should().BeFalse();
        clinic.IsDirectoryPublished.Should().BeFalse();
        clinic.IsPlatformVerified.Should().BeFalse();
        clinic.IsPublic.Should().BeFalse();
    }

    [Fact]
    public void SetWorkspaceEligibility_True_WhenNotPublished_KeepsClinicPrivate()
    {
        var clinic = new Clinic();

        clinic.SetWorkspaceEligibility(true);

        clinic.IsWorkspaceEligible.Should().BeTrue();
        clinic.IsDirectoryPublished.Should().BeFalse();
        clinic.IsPlatformVerified.Should().BeFalse();
        clinic.IsPublic.Should().BeFalse();
    }

    [Fact]
    public void SetDirectoryPublished_True_WhenNotEligible_KeepsClinicPrivate()
    {
        var clinic = new Clinic();

        clinic.SetDirectoryPublished(true);

        clinic.IsWorkspaceEligible.Should().BeFalse();
        clinic.IsDirectoryPublished.Should().BeTrue();
        clinic.IsPlatformVerified.Should().BeFalse();
        clinic.IsPublic.Should().BeFalse();
    }

    [Fact]
    public void EligibleAndPublished_WithoutPlatformVerification_KeepsClinicPrivate()
    {
        var clinic = new Clinic();

        clinic.SetWorkspaceEligibility(true);
        clinic.SetDirectoryPublished(true);

        clinic.IsWorkspaceEligible.Should().BeTrue();
        clinic.IsDirectoryPublished.Should().BeTrue();
        clinic.IsPlatformVerified.Should().BeFalse();
        clinic.IsPublic.Should().BeFalse();
    }

    [Fact]
    public void WhenAllThreeGatesApprove_IsPublicBecomesTrue()
    {
        var clinic = new Clinic();

        clinic.SetWorkspaceEligibility(true);
        clinic.SetDirectoryPublished(true);
        clinic.SetPlatformVerified(true);

        clinic.IsWorkspaceEligible.Should().BeTrue();
        clinic.IsDirectoryPublished.Should().BeTrue();
        clinic.IsPlatformVerified.Should().BeTrue();
        clinic.IsPublic.Should().BeTrue();
    }

    [Fact]
    public void RevokingWorkspaceEligibility_SetsIsPublicFalse_WhilePreservingOtherGates()
    {
        var clinic = new Clinic();
        clinic.SetWorkspaceEligibility(true);
        clinic.SetDirectoryPublished(true);
        clinic.SetPlatformVerified(true);
        clinic.IsPublic.Should().BeTrue();

        clinic.SetWorkspaceEligibility(false);

        clinic.IsWorkspaceEligible.Should().BeFalse();
        clinic.IsDirectoryPublished.Should().BeTrue();
        clinic.IsPlatformVerified.Should().BeTrue();
        clinic.IsPublic.Should().BeFalse();

        // Re-granting immediately restores public status
        clinic.SetWorkspaceEligibility(true);
        clinic.IsPublic.Should().BeTrue();
    }

    [Fact]
    public void RevokingDirectoryPublished_SetsIsPublicFalse_WhilePreservingOtherGates()
    {
        var clinic = new Clinic();
        clinic.SetWorkspaceEligibility(true);
        clinic.SetDirectoryPublished(true);
        clinic.SetPlatformVerified(true);
        clinic.IsPublic.Should().BeTrue();

        clinic.SetDirectoryPublished(false);

        clinic.IsWorkspaceEligible.Should().BeTrue();
        clinic.IsDirectoryPublished.Should().BeFalse();
        clinic.IsPlatformVerified.Should().BeTrue();
        clinic.IsPublic.Should().BeFalse();

        // Re-publishing immediately restores public status
        clinic.SetDirectoryPublished(true);
        clinic.IsPublic.Should().BeTrue();
    }

    [Fact]
    public void RevokingPlatformVerified_SetsIsPublicFalse_WhilePreservingOtherGates()
    {
        var clinic = new Clinic();
        clinic.SetWorkspaceEligibility(true);
        clinic.SetDirectoryPublished(true);
        clinic.SetPlatformVerified(true);
        clinic.IsPublic.Should().BeTrue();

        clinic.SetPlatformVerified(false);

        clinic.IsWorkspaceEligible.Should().BeTrue();
        clinic.IsDirectoryPublished.Should().BeTrue();
        clinic.IsPlatformVerified.Should().BeFalse();
        clinic.IsPublic.Should().BeFalse();

        clinic.SetPlatformVerified(true);
        clinic.IsPublic.Should().BeTrue();
    }

    [Fact]
    public void SyncPublicStatus_AccuratelyRecomputesIsPublic()
    {
        var clinic = new Clinic
        {
            IsWorkspaceEligible = true,
            IsDirectoryPublished = false,
            IsPlatformVerified = true,
            IsPublic = true // Out of sync
        };

        clinic.SyncPublicStatus();
        clinic.IsPublic.Should().BeFalse();

        clinic.IsDirectoryPublished = true;
        clinic.SyncPublicStatus();
        clinic.IsPublic.Should().BeTrue();
    }
}
