using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientPhilHealthMembership : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public PhilHealthMemberType MemberType { get; set; } = PhilHealthMemberType.MM;
    public PhilHealthDependentRelationship? DependentRelationship { get; set; }
    public string? MemberPin { get; set; }
    public string? PrincipalMemberPin { get; set; }

    public string? PrincipalLastName { get; set; }
    public string? PrincipalFirstName { get; set; }
    public string? PrincipalMiddleName { get; set; }
    public string? PrincipalSuffix { get; set; }
    public DateOnly? PrincipalDateOfBirth { get; set; }
    public Gender? PrincipalGender { get; set; }

    public string? MembershipCategoryCode { get; set; }
    public string? MembershipCategoryDesc { get; set; }
    public string? EmployerPin { get; set; }
    public string? EmployerName { get; set; }
    public string? DefaultWalkInAtc { get; set; }

    public string? PrincipalMemberLandlineNumber { get; set; }
    public string? PrincipalMemberMobileNumber { get; set; }
    public string? PrincipalMemberEmail { get; set; }
}
