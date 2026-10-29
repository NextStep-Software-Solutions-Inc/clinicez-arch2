using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientPhilHealthMembershipDto(
    Guid? Id,
    string MemberType,
    string? DependentRelationship = null,
    string? PhilHealthPin = null,
    string? PrincipalMemberPin = null,
    string? PrincipalLastName = null,
    string? PrincipalFirstName = null,
    string? PrincipalMiddleName = null,
    string? PrincipalSuffix = null,
    DateOnly? PrincipalDateOfBirth = null,
    string? PrincipalGender = null,
    string? MembershipCategoryCode = null,
    string? MembershipCategoryDesc = null,
    string? EmployerPin = null,
    string? EmployerName = null,
    string? DefaultWalkInAtc = null
);
