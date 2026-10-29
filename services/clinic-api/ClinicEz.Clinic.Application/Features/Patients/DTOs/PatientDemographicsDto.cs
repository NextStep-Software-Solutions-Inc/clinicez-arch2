using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

/// <summary>
/// Verified demographics and statutory identification badges for the glanceable patient summary spine and full chart.
/// </summary>
public sealed record PatientDemographicsDto(
    DateOnly Dob,
    int Age,
    string Gender,
    string? CivilStatus,
    string ContactNumber,
    string? Email,
    string? AddressLine,
    string? Barangay,
    string? City,
    string? Province,
    string? PhilHealthNumber,
    string? SeniorCitizenId,
    string? PwdId,
    string? BloodType,
    string? MemberStatus,
    string? PhilHealthAtc,
    string? ActiveCaseNo,
    string? EmergencyContactName = null,
    string? EmergencyContactPhone = null,
    string? EmergencyContactRelationship = null,
    string? Alerts = null,
    string? PatientCode = null,
    string? ClinicEzId = null,
    string VerificationStatus = "Verified",
    string? Sex = null,
    string? GenderIdentity = null
)
{
    /// <summary>Parity alias for full date of birth property naming.</summary>
    public DateOnly DateOfBirth => Dob;

    /// <summary>Parity alias for PhilHealth ATC property naming.</summary>
    public string? Atc => PhilHealthAtc;

    /// <summary>Statutory Senior Citizen flag (RA 9994: Age >= 60 or SeniorCitizenId provided).</summary>
    public bool IsSenior => !string.IsNullOrWhiteSpace(SeniorCitizenId) || Age >= 60;

    /// <summary>Statutory PWD flag (RA 10754: PwdId provided).</summary>
    public bool IsPwd => !string.IsNullOrWhiteSpace(PwdId);

    /// <summary>PhilHealth Enlisted / Case Number active flag.</summary>
    public bool HasActiveCaseNo => !string.IsNullOrWhiteSpace(ActiveCaseNo);
}
