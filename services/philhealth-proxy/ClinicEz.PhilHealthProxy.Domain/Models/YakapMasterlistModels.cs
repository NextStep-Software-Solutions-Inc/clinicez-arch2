namespace ClinicEz.PhilHealthProxy.Domain.Models;

public sealed record YakapAssignmentDto(
    string AssignedPin,
    string AssignedLastName,
    string AssignedFirstName,
    string? AssignedMiddleName,
    string? AssignedExtName,
    string AssignedDateOfBirth,
    string AssignedSex,
    string AssignedType,
    string PrimaryPin,
    string PrimaryLastName,
    string PrimaryFirstName,
    string? PrimaryMiddleName,
    string? PrimaryExtName,
    string PrimaryDateOfBirth,
    string PrimarySex,
    string? MobileNumber,
    string? LandlineNumber,
    string MemberCategory,
    string MemberCategoryDescription,
    string PackageType,
    string AssignedDate,
    string AssignedStatus,
    string EffectiveYear);

public sealed record YakapMasterlistResult(
    string HciAccreNo,
    int TotalCount,
    string TransmittalNumber,
    IReadOnlyList<YakapAssignmentDto> Assignments);
