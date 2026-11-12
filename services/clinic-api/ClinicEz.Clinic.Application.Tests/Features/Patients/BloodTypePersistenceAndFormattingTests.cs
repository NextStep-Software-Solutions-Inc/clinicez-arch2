using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class BloodTypePersistenceAndFormattingTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_blood_type_test";
    private readonly IClinicContext _clinicContext;

    public BloodTypePersistenceAndFormattingTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Theory]
    [InlineData("A+", BloodType.APositive)]
    [InlineData("A-", BloodType.ANegative)]
    [InlineData("B+", BloodType.BPositive)]
    [InlineData("B-", BloodType.BNegative)]
    [InlineData("AB+", BloodType.ABPositive)]
    [InlineData("AB-", BloodType.ABNegative)]
    [InlineData("O+", BloodType.OPositive)]
    [InlineData("O-", BloodType.ONegative)]
    [InlineData("Unknown", BloodType.Unknown)]
    [InlineData("a+", BloodType.APositive)]
    [InlineData("ab-", BloodType.ABNegative)]
    [InlineData("  O+  ", BloodType.OPositive)]
    [InlineData("A_POSITIVE", BloodType.APositive)]
    [InlineData("AB_NEGATIVE", BloodType.ABNegative)]
    [InlineData("APositive", BloodType.APositive)]
    [InlineData("ABNegative", BloodType.ABNegative)]
    [InlineData("A POSITIVE", BloodType.APositive)]
    [InlineData("AB NEGATIVE", BloodType.ABNegative)]
    public void BloodTypeParser_TryParse_ParsesValidRepresentationsCorrectly(string input, BloodType expected)
    {
        var success = BloodTypeParser.TryParse(input, out var result);
        success.Should().BeTrue();
        result.Should().Be(expected);

        var parseOrNull = BloodTypeParser.ParseOrNull(input);
        parseOrNull.Should().Be(expected);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("INVALID")]
    [InlineData("123")]
    [InlineData("O++")]
    [InlineData("C+")]
    public void BloodTypeParser_TryParse_RejectsInvalidOrEmptyInput(string? input)
    {
        var success = BloodTypeParser.TryParse(input, out var result);
        success.Should().BeFalse();
        result.Should().Be(default);

        var parseOrNull = BloodTypeParser.ParseOrNull(input);
        parseOrNull.Should().BeNull();
    }

    [Theory]
    [InlineData(BloodType.APositive, "A+")]
    [InlineData(BloodType.ANegative, "A-")]
    [InlineData(BloodType.BPositive, "B+")]
    [InlineData(BloodType.BNegative, "B-")]
    [InlineData(BloodType.ABPositive, "AB+")]
    [InlineData(BloodType.ABNegative, "AB-")]
    [InlineData(BloodType.OPositive, "O+")]
    [InlineData(BloodType.ONegative, "O-")]
    [InlineData(BloodType.Unknown, "Unknown")]
    [InlineData(null, null)]
    public void BloodTypeParser_Format_EmitsCanonicalClinicalStrings(BloodType? input, string? expected)
    {
        var formatted = BloodTypeParser.Format(input);
        formatted.Should().Be(expected);
    }

    [Fact]
    public async Task Issue142_UpdateClinicPatient_ChangesBloodTypeFromABNegativeToABPositive_AndPersistsToDb()
    {
        // Arrange - Simulate existing patient with BloodType.ABNegative
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-01085",
            FirstName = "Consuelo",
            LastName = "Eugenio",
            MiddleName = "M",
            DateOfBirth = new DateOnly(1985, 4, 12),
            Sex = BiologicalSex.Female,
            ContactNumber = "0917-111-2222",
            BloodType = BloodType.ABNegative, // Initially AB-
            VerificationStatus = PatientVerificationStatus.Verified,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Tester"
        };
        await context.Patients.AddAsync(patient);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var updateHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow, clinicContext: _clinicContext);

        // Act - Update blood type to "AB+" (matching steps to reproduce in Issue #142)
        var command = new UpdateClinicPatientCommand(
            Id: patientId,
            FirstName: "Consuelo",
            LastName: "Eugenio",
            MiddleName: "M",
            Suffix: null,
            DateOfBirth: new DateOnly(1985, 4, 12),
            Sex: "Female",
            CivilStatus: "Married",
            ContactNumber: "0917-111-2222",
            Email: null,
            BloodType: "AB+" // Updating to AB+
        );

        var updatedDto = await updateHandler.Handle(command, CancellationToken.None);

        // Assert DTO return value
        updatedDto.Should().NotBeNull();
        updatedDto.BloodType.Should().Be("AB+", "DTO should return canonically formatted blood type AB+");

        // Assert database persistence
        context.ChangeTracker.Clear();
        var persisted = await context.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == patientId);
        persisted.Should().NotBeNull();
        persisted!.BloodType.Should().Be(BloodType.ABPositive, "Database entity should have ABPositive persisted, not reverted");
    }

    [Fact]
    public async Task UpdateClinicPatient_ClearsBloodType_WhenNullOrWhitespaceProvided()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-99999",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = BiologicalSex.Male,
            ContactNumber = "0917-000-0000",
            BloodType = BloodType.OPositive,
            VerificationStatus = PatientVerificationStatus.Verified,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Tester"
        };
        await context.Patients.AddAsync(patient);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var updateHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow, clinicContext: _clinicContext);

        // Act - Clear blood type with empty string
        var clearCommand = new UpdateClinicPatientCommand(
            Id: patientId,
            FirstName: "Juan",
            LastName: "Dela Cruz",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1990, 1, 1),
            Sex: "Male",
            CivilStatus: "Single",
            ContactNumber: "0917-000-0000",
            Email: null,
            BloodType: "" // Empty string should clear
        );

        var updatedDto = await updateHandler.Handle(clearCommand, CancellationToken.None);
        updatedDto.BloodType.Should().BeNull();

        context.ChangeTracker.Clear();
        var persisted = await context.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == patientId);
        persisted!.BloodType.Should().BeNull();
    }

    [Fact]
    public async Task RegisterClinicPatient_PersistsBloodType_WhenRegisteredWithSymbol()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var regHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        // Act - Register with "O-"
        var regCommand = new RegisterClinicPatientCommand(
            FirstName: "Maria",
            LastName: "Clara",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(2000, 1, 1),
            Sex: "Female",
            CivilStatus: "Single",
            ContactNumber: "0917-222-3333",
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
            BloodType: "O-",
            Allergies: null,
            ChronicConditions: null,
            Alerts: null
        );

        var registeredDto = await regHandler.Handle(regCommand, CancellationToken.None);

        // Assert
        registeredDto.BloodType.Should().Be("O-");

        context.ChangeTracker.Clear();
        var persisted = await context.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == registeredDto.Id);
        persisted.Should().NotBeNull();
        persisted!.BloodType.Should().Be(BloodType.ONegative);
    }

    [Fact]
    public async Task UpdateClinicPatientCommandValidator_ValidatesBloodTypeCorrectly()
    {
        var validator = new UpdateClinicPatientCommandValidator();

        var validCommand = new UpdateClinicPatientCommand(
            Id: Guid.NewGuid(),
            FirstName: "Consuelo",
            LastName: "Eugenio",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1985, 4, 12),
            Sex: "Female",
            CivilStatus: "Married",
            ContactNumber: "0917-111-2222",
            Email: null,
            BloodType: "AB+"
        );
        var validResult = await validator.ValidateAsync(validCommand);
        validResult.IsValid.Should().BeTrue();

        var invalidCommand = new UpdateClinicPatientCommand(
            Id: Guid.NewGuid(),
            FirstName: "Consuelo",
            LastName: "Eugenio",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1985, 4, 12),
            Sex: "Female",
            CivilStatus: "Married",
            ContactNumber: "0917-111-2222",
            Email: null,
            BloodType: "INVALID_GROUP"
        );
        var invalidResult = await validator.ValidateAsync(invalidCommand);
        invalidResult.IsValid.Should().BeFalse();
        invalidResult.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.BloodType));
    }
}
