using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class RegisterPatientStructuredAllergiesTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_allergy_test";

    public RegisterPatientStructuredAllergiesTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task Handle_WithStructuredAllergies_CreatesRelationalPatientAllergyEntities()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, allergyRepo);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Maria",
            LastName: "Clara",
            MiddleName: "de los Santos",
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 3, 12),
            Sex: "Female",
            CivilStatus: "Single",
            ContactNumber: "09175551234",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "B+",
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            StructuredAllergies: new List<CreateAllergyRequest>
            {
                new(Category: "Medication", Allergen: "Amoxicillin", AllergenDrugCode: "AMX500", Severity: "Severe", ReactionManifestation: "Urticaria, Dyspnea", IsAnaphylactic: true),
                new(Category: "Food", Allergen: "Shrimp", Severity: "Moderate", ReactionManifestation: "Lip swelling", IsAnaphylactic: false)
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Allergies.Should().Contain("Amoxicillin");
        result.Allergies.Should().Contain("Shrimp");

        var savedAllergies = await allergyRepo.Query(a => a.PatientId == result.Id).ToListAsync();
        savedAllergies.Should().HaveCount(2);

        var amox = savedAllergies.First(a => a.Allergen == "Amoxicillin");
        amox.Category.Should().Be(AllergyCategory.Medication);
        amox.AllergenDrugCode.Should().Be("AMX500");
        amox.Severity.Should().Be(AllergySeverity.Severe);
        amox.IsAnaphylactic.Should().BeTrue();
        amox.Status.Should().Be(AllergyStatus.Active);

        var shrimp = savedAllergies.First(a => a.Allergen == "Shrimp");
        shrimp.Category.Should().Be(AllergyCategory.Food);
        shrimp.Severity.Should().Be(AllergySeverity.Moderate);
        shrimp.IsAnaphylactic.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_LifeThreateningSeverity_SetsIsAnaphylacticTrue()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, allergyRepo);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Carlos",
            LastName: "Garcia",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1988, 7, 24),
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09179998877",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            StructuredAllergies: new List<CreateAllergyRequest>
            {
                new(Category: "Medication", Allergen: "Penicillin G", Severity: "LifeThreatening", IsAnaphylactic: false)
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        var savedAllergy = await allergyRepo.Query(a => a.PatientId == result.Id).FirstOrDefaultAsync();
        savedAllergy.Should().NotBeNull();
        savedAllergy!.Severity.Should().Be(AllergySeverity.LifeThreatening);
        savedAllergy.IsAnaphylactic.Should().BeTrue("LifeThreatening severity must set IsAnaphylactic to true");
    }

    [Fact]
    public async Task Handle_BackwardCompatibleLegacyStringAllergies_SavesWithoutStructuredList()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Elena",
            LastName: "Reyes",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1992, 4, 10),
            Sex: "Female",
            CivilStatus: null,
            ContactNumber: "09187776655",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: "Aspirin, Ibuprofen",
            ChronicConditions: null,
            Alerts: null,
            StructuredAllergies: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Allergies.Should().Be("Aspirin, Ibuprofen");
    }
}
