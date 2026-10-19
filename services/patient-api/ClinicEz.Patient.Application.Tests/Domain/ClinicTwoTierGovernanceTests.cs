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
        clinic.IsPublic.Should().BeFalse();
    }

    [Fact]
    public void SetWorkspaceEligibility_True_WhenNotPublished_KeepsClinicPrivate()
    {
        var clinic = new Clinic();

        clinic.SetWorkspaceEligibility(true);

        clinic.IsWorkspaceEligible.Should().BeTrue();
        clinic.IsDirectoryPublished.Should().BeFalse();
        clinic.IsPublic.Should().BeFalse();
    }

    [Fact]
    public void SetDirectoryPublished_True_WhenNotEligible_KeepsClinicPrivate()
    {
        var clinic = new Clinic();

        clinic.SetDirectoryPublished(true);

        clinic.IsWorkspaceEligible.Should().BeFalse();
        clinic.IsDirectoryPublished.Should().BeTrue();
        clinic.IsPublic.Should().BeFalse();
    }

    [Fact]
    public void WhenBothTiersApprove_IsPublicBecomesTrue()
    {
        var clinic = new Clinic();

        clinic.SetWorkspaceEligibility(true);
        clinic.SetDirectoryPublished(true);

        clinic.IsWorkspaceEligible.Should().BeTrue();
        clinic.IsDirectoryPublished.Should().BeTrue();
        clinic.IsPublic.Should().BeTrue();
    }

    [Fact]
    public void RevokingWorkspaceEligibility_SetsIsPublicFalse_WhilePreservingDirectoryPublished()
    {
        var clinic = new Clinic();
        clinic.SetWorkspaceEligibility(true);
        clinic.SetDirectoryPublished(true);
        clinic.IsPublic.Should().BeTrue();

        clinic.SetWorkspaceEligibility(false);

        clinic.IsWorkspaceEligible.Should().BeFalse();
        clinic.IsDirectoryPublished.Should().BeTrue();
        clinic.IsPublic.Should().BeFalse();

        // Re-granting immediately restores public status
        clinic.SetWorkspaceEligibility(true);
        clinic.IsPublic.Should().BeTrue();
    }

    [Fact]
    public void RevokingDirectoryPublished_SetsIsPublicFalse_WhilePreservingWorkspaceEligibility()
    {
        var clinic = new Clinic();
        clinic.SetWorkspaceEligibility(true);
        clinic.SetDirectoryPublished(true);
        clinic.IsPublic.Should().BeTrue();

        clinic.SetDirectoryPublished(false);

        clinic.IsWorkspaceEligible.Should().BeTrue();
        clinic.IsDirectoryPublished.Should().BeFalse();
        clinic.IsPublic.Should().BeFalse();

        // Re-publishing immediately restores public status
        clinic.SetDirectoryPublished(true);
        clinic.IsPublic.Should().BeTrue();
    }

    [Fact]
    public void SyncPublicStatus_AccuratelyRecomputesIsPublic()
    {
        var clinic = new Clinic
        {
            IsWorkspaceEligible = true,
            IsDirectoryPublished = false,
            IsPublic = true // Out of sync
        };

        clinic.SyncPublicStatus();
        clinic.IsPublic.Should().BeFalse();

        clinic.IsDirectoryPublished = true;
        clinic.SyncPublicStatus();
        clinic.IsPublic.Should().BeTrue();
    }
}
