using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientGuardianDto(
    string FirstName,
    string LastName,
    string RelationshipCode,
    string ContactNumber = "",
    string? MiddleName = null,
    string? Suffix = null,
    DateOnly? BirthDate = null,
    string? Sex = null,
    string? RelationshipOtherSpecify = null,
    string? PhilHealthPin = null,
    bool IsPrimaryGuardian = true,
    bool IsEmergencyContact = true,
    Guid? Id = null);
