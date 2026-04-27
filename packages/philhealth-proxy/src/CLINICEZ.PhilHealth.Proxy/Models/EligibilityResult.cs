namespace CLINICEZ.PhilHealth.Proxy.Models;

public record EligibilityResult(
    string PhilHealthNumber,
    bool IsEligible,
    string MemberType,
    string Status,
    string? PackageCategory,
    IReadOnlyList<string> Diagnoses,
    string? HospitalAccreditationNumber,
    string? EffectivityDate,
    string? Remarks
);
