using System.Xml.Linq;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// In-memory parser for PhilHealth registration masterlist XML payloads.
/// </summary>
public sealed class KonsultaMasterlistParser : IKonsultaMasterlistParser
{
    // Standard PhilHealth Modulus-11 weights for 11 digits: [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    private static readonly int[] Mod11Weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

    public YakapMasterlistResult ParseMasterlistXml(string xmlContent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(xmlContent);

        var doc = XDocument.Parse(xmlContent);
        var root = doc.Root
            ?? throw new InvalidOperationException("Masterlist XML document does not contain a root element.");

        if (!root.Name.LocalName.Equals("ASSIGNMENTS", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Expected root element 'ASSIGNMENTS', found '{root.Name.LocalName}'.");
        }

        string accreNo = root.Attribute("pHciAccreNo")?.Value ?? string.Empty;
        string transmittal = root.Attribute("pReportTransmittalNumber")?.Value ?? string.Empty;
        int.TryParse(root.Attribute("pAssignmentTotalCnt")?.Value, out int totalCount);

        var assignments = new List<YakapAssignmentDto>();

        foreach (var elem in root.Elements())
        {
            if (!elem.Name.LocalName.Equals("ASSIGNMENT", StringComparison.OrdinalIgnoreCase))
                continue;

            assignments.Add(new YakapAssignmentDto(
                AssignedPin: elem.Attribute("pAssignedPin")?.Value ?? string.Empty,
                AssignedLastName: elem.Attribute("pAssignedLastName")?.Value ?? string.Empty,
                AssignedFirstName: elem.Attribute("pAssignedFirstName")?.Value ?? string.Empty,
                AssignedMiddleName: elem.Attribute("pAssignedMiddleName")?.Value,
                AssignedExtName: elem.Attribute("pAssignedExtName")?.Value,
                AssignedDateOfBirth: elem.Attribute("pAssignedDateOfBirth")?.Value ?? string.Empty,
                AssignedSex: elem.Attribute("pAssignedSex")?.Value ?? string.Empty,
                AssignedType: elem.Attribute("pAssignedType")?.Value ?? string.Empty,
                PrimaryPin: elem.Attribute("pPrimaryPIN")?.Value ?? string.Empty,
                PrimaryLastName: elem.Attribute("pPrimaryLastName")?.Value ?? string.Empty,
                PrimaryFirstName: elem.Attribute("pPrimaryFirstName")?.Value ?? string.Empty,
                PrimaryMiddleName: elem.Attribute("pPrimaryMiddleName")?.Value,
                PrimaryExtName: elem.Attribute("pPrimaryExtName")?.Value,
                PrimaryDateOfBirth: elem.Attribute("pPrimaryDateOfBirth")?.Value ?? string.Empty,
                PrimarySex: elem.Attribute("pPrimarySex")?.Value ?? string.Empty,
                MobileNumber: elem.Attribute("pMobileNumber")?.Value,
                LandlineNumber: elem.Attribute("pLandlineNumber")?.Value,
                MemberCategory: elem.Attribute("pMemberNewCat")?.Value ?? string.Empty,
                MemberCategoryDescription: elem.Attribute("pMemberNewCatDesc")?.Value ?? string.Empty,
                PackageType: elem.Attribute("pPackageType")?.Value ?? "K",
                AssignedDate: elem.Attribute("pAssignedDate")?.Value ?? string.Empty,
                AssignedStatus: elem.Attribute("pAssignedStatus")?.Value ?? "1",
                EffectiveYear: elem.Attribute("pEffYear")?.Value ?? string.Empty));
        }

        return new YakapMasterlistResult(
            HciAccreNo: accreNo,
            TotalCount: totalCount > 0 ? totalCount : assignments.Count,
            TransmittalNumber: transmittal,
            Assignments: assignments);
    }

    public bool ValidatePin(string pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;

        // Clean any hyphens or spaces
        string cleaned = pin.Replace("-", "").Replace(" ", "").Trim();
        if (cleaned.Length != 12 || !cleaned.All(char.IsAsciiDigit)) return false;

        int sum = 0;
        for (int i = 0; i < 11; i++)
        {
            sum += (cleaned[i] - '0') * Mod11Weights[i];
        }

        int remainder = sum % 11;
        int expectedCheckDigit = (11 - remainder) % 11;
        int actualCheckDigit = cleaned[11] - '0';

        // Check digit 10 can be represented as 0 in modulus 11
        if (expectedCheckDigit == 10 && actualCheckDigit == 0)
            return true;

        return expectedCheckDigit == actualCheckDigit;
    }
}
