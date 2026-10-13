using System;
using FluentAssertions;
using ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Shared.Security.ClaimTokens;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Patients.Commands;

public sealed class PatientClaimConflictResolverTests
{
    private readonly PatientClaimConflictResolver _resolver = new();

    private static ClaimTokenClaims CreateClaims(
        string firstName = "Juan",
        string lastName = "Rizal",
        DateOnly? dob = null,
        string? memberType = "MM",
        string? email = "juan.rizal@example.ph")
    {
        var now = DateTime.UtcNow;
        return new ClaimTokenClaims(
            joinRequestId: Guid.NewGuid(),
            tenantSlug: "tenant-a",
            facilitySlug: "facility-1",
            email: email,
            firstName: firstName,
            lastName: lastName,
            dateOfBirth: dob ?? new DateOnly(1995, 6, 19),
            memberType: memberType,
            expiresAtUtc: now.AddHours(48));
    }

    private static Domain.Entities.Patient CreateAdultPatient(
        string firstName = "Juan",
        string lastName = "Rizal",
        DateOnly? dob = null,
        string? email = "juan.personal@gmail.com")
    {
        return new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_123",
            FirstName = firstName,
            LastName = lastName,
            DateOfBirth = dob ?? new DateOnly(1995, 6, 19),
            Email = email,
            ConsentToShareInfo = true
        };
    }

    [Fact]
    public void Resolve_WhenIntakeIsMinor_ReturnsManagedDependentProxy()
    {
        var minorDob = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-5));
        var claims = CreateClaims(firstName: "Baby", lastName: "Rizal", dob: minorDob);
        var claimant = CreateAdultPatient();

        var result = _resolver.Resolve(claimant, claims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.ManagedDependentProxy);
        result.RelationshipType.Should().Be("Dependent");
        result.Reason.Should().Contain("Minor");
    }

    [Fact]
    public void Resolve_WhenMemberTypeIsDD_ReturnsManagedDependentProxy()
    {
        var claims = CreateClaims(firstName: "Dependent", lastName: "Rizal", memberType: "DD");
        var claimant = CreateAdultPatient();

        var result = _resolver.Resolve(claimant, claims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.ManagedDependentProxy);
        result.RelationshipType.Should().Be("Dependent");
        result.Reason.Should().Contain("statutory dependent");
    }

    [Fact]
    public void Resolve_WhenIsDependentClaimFlagTrue_ReturnsManagedDependentProxy()
    {
        var claims = CreateClaims(firstName: "AdultWard", lastName: "Rizal", dob: new DateOnly(2000, 1, 1));
        var claimant = CreateAdultPatient();

        var result = _resolver.Resolve(claimant, claims, isDependentClaim: true, relationshipToDependent: "Ward");

        result.Outcome.Should().Be(ClaimConflictOutcome.ManagedDependentProxy);
        result.RelationshipType.Should().Be("Dependent");
    }

    [Fact]
    public void Resolve_WhenClaimantIsNull_AndIntakeIsAdultSelf_ReturnsNewSelf()
    {
        var claims = CreateClaims(firstName: "Maria", lastName: "Clara", dob: new DateOnly(1998, 3, 15));

        var result = _resolver.Resolve(claimant: null, claims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.NewSelf);
        result.RelationshipType.Should().Be("Self");
    }

    [Fact]
    public void Resolve_WhenClaimantMatchesNameAndDob_DifferentEmail_ReturnsExistingSelf_AlternateEmailLinking()
    {
        var claims = CreateClaims(
            firstName: "Juan",
            lastName: "Rizal",
            dob: new DateOnly(1995, 6, 19),
            email: "juan.corporate@work.ph");

        var claimant = CreateAdultPatient(
            firstName: "Juan",
            lastName: "Rizal",
            dob: new DateOnly(1995, 6, 19),
            email: "juan.personal@gmail.com");

        var result = _resolver.Resolve(claimant, claims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.ExistingSelf);
        result.RelationshipType.Should().Be("Self");
        result.Reason.Should().Contain("Alternate email linking");
    }

    [Fact]
    public void Resolve_WhenClaimantMatchesNameAndDob_SameEmail_ReturnsExistingSelf()
    {
        var claims = CreateClaims(
            firstName: "Juan",
            lastName: "Rizal",
            dob: new DateOnly(1995, 6, 19),
            email: "juan.rizal@example.ph");

        var claimant = CreateAdultPatient(
            firstName: "Juan",
            lastName: "Rizal",
            dob: new DateOnly(1995, 6, 19),
            email: "juan.rizal@example.ph");

        var result = _resolver.Resolve(claimant, claims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.ExistingSelf);
        result.RelationshipType.Should().Be("Self");
    }

    [Fact]
    public void Resolve_WhenAuthenticatedAdultClaimsUnrelatedAdult_ReturnsMedicalPrivacyBlocked()
    {
        var strangerClaims = CreateClaims(
            firstName: "Andres",
            lastName: "Bonifacio",
            dob: new DateOnly(1988, 11, 30));

        var claimant = CreateAdultPatient(
            firstName: "Emilio",
            lastName: "Aguinaldo",
            dob: new DateOnly(1985, 3, 22));

        var result = _resolver.Resolve(claimant, strangerClaims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.MedicalPrivacyBlocked);
        result.RelationshipType.Should().Be("Blocked");
        result.Reason.Should().Contain("medical privacy");
    }

    [Fact]
    public void Resolve_CaseInsensitiveNameMatching_ReturnsExistingSelf()
    {
        var claims = CreateClaims(
            firstName: "JUAN",
            lastName: "RIZAL",
            dob: new DateOnly(1995, 6, 19));

        var claimant = CreateAdultPatient(
            firstName: "juan",
            lastName: "rizal",
            dob: new DateOnly(1995, 6, 19));

        var result = _resolver.Resolve(claimant, claims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.ExistingSelf);
        result.RelationshipType.Should().Be("Self");
    }
}
