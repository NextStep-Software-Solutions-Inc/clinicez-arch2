namespace PatientApp.Application.Common.DTOs;

public sealed record PatientSummaryDto(
    Guid Id,
    string FirstName,
    string? MiddleName,
    string LastName,
    string? Suffix,
    string? Sex,
    DateOnly? DateOfBirth,
    string? BloodType,
    string? CivilStatus,
    string? Nationality,
    string? Mobile,
    string? Email,
    string? AvatarUrl,
    bool ConsentToShareInfo);

public sealed record PatientAddressDto(
    Guid Id,
    string Type,
    string? Street,
    string? Barangay,
    string? City,
    string? Province,
    string? ZipCode,
    string? Country,
    bool IsPrimary);

public sealed record EmergencyContactDto(
    Guid Id,
    string FullName,
    string? Relationship,
    string? Mobile,
    string? AltPhone,
    bool IsPrimary);

public sealed record PatientProfileDto(
    PatientSummaryDto Demographics,
    IReadOnlyList<PatientAddressDto> Addresses,
    IReadOnlyList<EmergencyContactDto> EmergencyContacts);
