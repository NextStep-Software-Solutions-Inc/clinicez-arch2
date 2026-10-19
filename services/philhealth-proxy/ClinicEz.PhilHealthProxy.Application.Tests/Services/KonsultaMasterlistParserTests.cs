using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class KonsultaMasterlistParserTests
{
    private readonly KonsultaMasterlistParser _parser = new();

    private const string SampleMasterlistXml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <ASSIGNMENTS pUsername="H90000001" pPassword="password" pHciAccreNo="H90000001" pAssignmentTotalCnt="2" pReportTransmittalNumber="RH9000000120261000001">
            <ASSIGNMENT pAssignedPin="030263078507" pAssignedLastName="DELA CRUZ" pAssignedFirstName="JUAN" pAssignedMiddleName="SANTOS" pAssignedExtName="" pAssignedDateOfBirth="1985-05-15" pAssignedSex="M" pAssignedType="MM" pPrimaryPIN="030263078507" pPrimaryLastName="DELA CRUZ" pPrimaryFirstName="JUAN" pPrimaryMiddleName="SANTOS" pPrimaryExtName="" pPrimaryDateOfBirth="1985-05-15" pPrimarySex="M" pMobileNumber="09171234567" pLandlineNumber="" pMemberNewCat="DIRECT" pMemberNewCatDesc="Direct Contributor" pPackageType="K" pAssignedDate="2026-01-10" pAssignedStatus="1" pEffYear="2026" />
            <ASSIGNMENT pAssignedPin="242500004774" pAssignedLastName="DELA CRUZ" pAssignedFirstName="MARIA" pAssignedMiddleName="SANTOS" pAssignedExtName="" pAssignedDateOfBirth="2021-08-01" pAssignedSex="F" pAssignedType="DD" pPrimaryPIN="030263078507" pPrimaryLastName="DELA CRUZ" pPrimaryFirstName="JUAN" pPrimaryMiddleName="SANTOS" pPrimaryExtName="" pPrimaryDateOfBirth="1985-05-15" pPrimarySex="M" pMobileNumber="09171234567" pLandlineNumber="" pMemberNewCat="DIRECT" pMemberNewCatDesc="Direct Contributor" pPackageType="K" pAssignedDate="2026-01-10" pAssignedStatus="1" pEffYear="2026" />
        </ASSIGNMENTS>
        """;

    [Fact]
    public void ParseMasterlistXml_ShouldExtractMetadataAndAssignments()
    {
        var result = _parser.ParseMasterlistXml(SampleMasterlistXml);

        result.Should().NotBeNull();
        result.HciAccreNo.Should().Be("H90000001");
        result.TransmittalNumber.Should().Be("RH9000000120261000001");
        result.TotalCount.Should().Be(2);
        result.Assignments.Should().HaveCount(2);

        var first = result.Assignments[0];
        first.AssignedPin.Should().Be("030263078507");
        first.AssignedLastName.Should().Be("DELA CRUZ");
        first.AssignedFirstName.Should().Be("JUAN");
        first.AssignedType.Should().Be("MM");
        first.PackageType.Should().Be("K");

        var second = result.Assignments[1];
        second.AssignedPin.Should().Be("242500004774");
        second.AssignedLastName.Should().Be("DELA CRUZ");
        second.AssignedFirstName.Should().Be("MARIA");
        second.AssignedType.Should().Be("DD");
        second.PrimaryPin.Should().Be("030263078507");
    }

    [Theory]
    [InlineData("030263078507", true)]  // Official PhilHealth sample PIN 1
    [InlineData("242500004774", true)]  // Official PhilHealth sample PIN 2
    [InlineData("03-026307850-7", true)] // Hyphenated format
    [InlineData("030263078508", false)] // Wrong check digit
    [InlineData("12345", false)]        // Too short
    [InlineData("03026307850X", false)] // Non-digit
    public void ValidatePin_ShouldVerifyModulus11(string pin, bool expected)
    {
        var isValid = _parser.ValidatePin(pin);
        isValid.Should().Be(expected);
    }
}
