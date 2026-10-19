using ClinicEz.Shared.Workspace;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Workspace;

public class WorkspaceBrandTests
{
    private const string Default = "#0284C7";

    [Fact]
    public void FacilityOwnChoice_Wins()
        => Assert.Equal("#112233", WorkspaceBrand.ResolveAccent("#112233", "#AABBCC", Default));

    [Theory]
    [InlineData("#0284C7")]
    [InlineData("#0284c7")]
    [InlineData("")]
    [InlineData(null)]
    public void UnsetFacility_FallsBackToWorkspace(string? own)
        => Assert.Equal("#AABBCC", WorkspaceBrand.ResolveAccent(own, "#AABBCC", Default));

    [Theory]
    [InlineData("red")]
    [InlineData("#ABC")]
    [InlineData("#GGGGGG")]
    [InlineData("")]
    [InlineData(null)]
    public void InvalidWorkspaceAccent_IsIgnored(string? workspace)
        => Assert.Equal(Default, WorkspaceBrand.ResolveAccent(Default, workspace, Default));

    [Fact]
    public void NothingSet_ReturnsProductDefault()
        => Assert.Equal(Default, WorkspaceBrand.ResolveAccent(null, null, Default));
}
