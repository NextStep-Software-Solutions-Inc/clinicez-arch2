namespace CLINICEZ.PhilHealth.Proxy.Models;

public record PhilHealthMemberInfo(
    string PhilHealthNumber,
    string LastName,
    string FirstName,
    string? MiddleName,
    string MemberCategory,
    string Status,
    string? EffectivityDate,
    string? ExpiryDate,
    string? DateOfBirth,
    string? Sex
);
