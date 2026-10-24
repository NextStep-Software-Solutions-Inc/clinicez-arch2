using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.Validation;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class Issue76CustomFieldNumberAndClearTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_issue76_test";
    private readonly IClinicContext _clinicContext;

    public Issue76CustomFieldNumberAndClearTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private ClinicCustomFieldDefinition CreateActiveNumberDefinition(string key = "annual_income", string label = "Annual Income") =>
        new()
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = key,
            Label = label,
            DataType = CustomFieldDataType.Number,
            IsActive = true
        };

    private ClinicCustomFieldDefinition CreateActiveTextDefinition(string key = "notes", string label = "Notes") =>
        new()
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = key,
            Label = label,
            DataType = CustomFieldDataType.Text,
            IsActive = true
        };

    private RegisterClinicPatientCommand CreateRegisterCommand(string firstName, string lastName, Dictionary<string, object?> customFields) =>
        new(
            FirstName: firstName,
            LastName: lastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 5, 20),
            Gender: "Female",
            CivilStatus: "Single",
            ContactNumber: "0917-111-2222",
            Email: $"{firstName.ToLower()}@example.com",
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
            CustomFields: customFields
        );

    // =========================================================================
    // TIER 1: CustomFieldValueValidator Direct Unit Tests
    // =========================================================================

    [Theory]
    [InlineData("A")]
    [InlineData("!$#%")]
    [InlineData("12.")]
    [InlineData("12.34.56")]
    [InlineData("-")]
    [InlineData(".")]
    [InlineData("-.")]
    [InlineData("12a3")]
    [InlineData("abc")]
    [InlineData("NaN")]
    [InlineData("Infinity")]
    public void CustomFieldValueValidator_Direct_NumberValidation_RejectsInvalidStrings_WithValidationException(string invalidInput)
    {
        var def = CreateActiveNumberDefinition("annual_income", "Annual Income");
        var customFields = new Dictionary<string, object?> { ["annual_income"] = invalidInput };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        act.Should().Throw<ValidationException>()
            .WithMessage("Annual Income must be a valid number.");
    }

    [Theory]
    [InlineData("0")]
    [InlineData("42")]
    [InlineData("-5")]
    [InlineData("3.14")]
    [InlineData("-0.75")]
    [InlineData("-5.5")]
    [InlineData("  42  ")]
    public void CustomFieldValueValidator_Direct_NumberValidation_AcceptsValidNumericStrings(string validInput)
    {
        var def = CreateActiveNumberDefinition("annual_income", "Annual Income");
        var customFields = new Dictionary<string, object?> { ["annual_income"] = validInput };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        act.Should().NotThrow();
        customFields.Should().ContainKey("annual_income");
        customFields["annual_income"]!.ToString().Should().Be(validInput.Trim());
    }

    [Fact]
    public void CustomFieldValueValidator_Direct_NumberValidation_AcceptsPrimitiveNumbers()
    {
        var def = CreateActiveNumberDefinition("weight", "Weight");
        var customFields = new Dictionary<string, object?>
        {
            ["weight"] = 65,
            ["gpa"] = 3.75,
            ["offset"] = -5L,
            ["balance"] = 1200.50m
        };

        var defs = new[]
        {
            def,
            CreateActiveNumberDefinition("gpa", "GPA"),
            CreateActiveNumberDefinition("offset", "Offset"),
            CreateActiveNumberDefinition("balance", "Balance")
        };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, defs);

        act.Should().NotThrow();
        customFields["weight"].Should().Be(65);
        customFields["gpa"].Should().Be(3.75);
        customFields["offset"].Should().Be(-5L);
        customFields["balance"].Should().Be(1200.50m);
    }

    [Fact]
    public void CustomFieldValueValidator_Direct_JsonElement_HandlesPolymorphicTypes()
    {
        var def = CreateActiveNumberDefinition("annual_income", "Annual Income");

        // 1. Valid JsonElement Number
        using var jsonDoc1 = JsonDocument.Parse("{\"val\": 50000}");
        var dict1 = new Dictionary<string, object?> { ["annual_income"] = jsonDoc1.RootElement.GetProperty("val") };
        CustomFieldValueValidator.ValidateAndNormalize(dict1, new[] { def });
        dict1.Should().ContainKey("annual_income");
        dict1["annual_income"].Should().Be(50000L);

        // 2. Valid JsonElement String
        using var jsonDoc2 = JsonDocument.Parse("{\"val\": \"42.5\"}");
        var dict2 = new Dictionary<string, object?> { ["annual_income"] = jsonDoc2.RootElement.GetProperty("val") };
        CustomFieldValueValidator.ValidateAndNormalize(dict2, new[] { def });
        dict2["annual_income"].Should().Be("42.5");

        // 3. Invalid JsonElement String
        using var jsonDoc3 = JsonDocument.Parse("{\"val\": \"A\"}");
        var dict3 = new Dictionary<string, object?> { ["annual_income"] = jsonDoc3.RootElement.GetProperty("val") };
        var act3 = () => CustomFieldValueValidator.ValidateAndNormalize(dict3, new[] { def });
        act3.Should().Throw<ValidationException>().WithMessage("Annual Income must be a valid number.");

        // 4. Invalid JsonElement Boolean
        using var jsonDoc4 = JsonDocument.Parse("{\"val\": true}");
        var dict4 = new Dictionary<string, object?> { ["annual_income"] = jsonDoc4.RootElement.GetProperty("val") };
        var act4 = () => CustomFieldValueValidator.ValidateAndNormalize(dict4, new[] { def });
        act4.Should().Throw<ValidationException>().WithMessage("Annual Income must be a valid number.");

        // 5. Blank JsonElement Null -> Purged
        using var jsonDoc5 = JsonDocument.Parse("{\"val\": null}");
        var dict5 = new Dictionary<string, object?> { ["annual_income"] = jsonDoc5.RootElement.GetProperty("val") };
        CustomFieldValueValidator.ValidateAndNormalize(dict5, new[] { def });
        dict5.Should().NotContainKey("annual_income");

        // 6. Blank JsonElement Whitespace String -> Purged
        using var jsonDoc6 = JsonDocument.Parse("{\"val\": \"   \"}");
        var dict6 = new Dictionary<string, object?> { ["annual_income"] = jsonDoc6.RootElement.GetProperty("val") };
        CustomFieldValueValidator.ValidateAndNormalize(dict6, new[] { def });
        dict6.Should().NotContainKey("annual_income");
    }

    [Fact]
    public void CustomFieldValueValidator_Direct_Clearing_RemovesActiveKeys()
    {
        var textDef = CreateActiveTextDefinition("notes", "Notes");
        var numDef = CreateActiveNumberDefinition("annual_income", "Annual Income");
        var defs = new[] { textDef, numDef };

        // Test with null, empty string, and whitespace
        var customFields = new Dictionary<string, object?>
        {
            ["notes"] = "",
            ["annual_income"] = "   ",
            ["other_active"] = null
        };

        var defsWithOther = new[] { textDef, numDef, CreateActiveTextDefinition("other_active", "Other Active") };
        CustomFieldValueValidator.ValidateAndNormalize(customFields, defsWithOther);

        customFields.Should().NotContainKey("notes");
        customFields.Should().NotContainKey("annual_income");
        customFields.Should().NotContainKey("other_active");
    }

    [Fact]
    public void CustomFieldValueValidator_Direct_UntypedKeys_PreservesRawDictionaryRoundtrip()
    {
        var numDef = CreateActiveNumberDefinition("annual_income", "Annual Income");

        var customFields = new Dictionary<string, object?>
        {
            ["annual_income"] = "50000",
            ["empty_str"] = "",
            ["spaces_only"] = "   ",
            ["null_val"] = null,
            ["legacy_id"] = "ABC-123",
            ["member_type"] = "Indigent"
        };

        CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { numDef });

        customFields.Should().ContainKey("annual_income");
        customFields.Should().ContainKey("empty_str");
        customFields["empty_str"].Should().Be("");
        customFields.Should().ContainKey("spaces_only");
        customFields["spaces_only"].Should().Be("   ");
        customFields.Should().ContainKey("null_val");
        customFields["null_val"].Should().BeNull();
        customFields.Should().ContainKey("legacy_id");
        customFields["legacy_id"].Should().Be("ABC-123");
        customFields.Should().ContainKey("member_type");
        customFields["member_type"].Should().Be("Indigent");
    }

    [Fact]
    public void CustomFieldValueValidator_Direct_InactiveOrNonPatientDefinition_BypassesValidation()
    {
        var inactiveDef = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "inactive_num",
            Label = "Inactive Number",
            DataType = CustomFieldDataType.Number,
            IsActive = false
        };

        var otherEntityDef = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicStaff",
            FieldKey = "staff_num",
            Label = "Staff Number",
            DataType = CustomFieldDataType.Number,
            IsActive = true
        };

        var customFields = new Dictionary<string, object?>
        {
            ["inactive_num"] = "A",
            ["staff_num"] = "!$#%"
        };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { inactiveDef, otherEntityDef }, "ClinicPatient");

        act.Should().NotThrow();
        customFields.Should().ContainKey("inactive_num");
        customFields["inactive_num"].Should().Be("A");
        customFields.Should().ContainKey("staff_num");
        customFields["staff_num"].Should().Be("!$#%");
    }

    // =========================================================================
    // TIER 2: RegisterClinicPatientCommand Integration Tests
    // =========================================================================

    [Theory]
    [InlineData("A")]
    [InlineData("!$#%")]
    [InlineData("12.")]
    [InlineData("12.34.56")]
    [InlineData("-")]
    [InlineData(".")]
    [InlineData("12a3")]
    public async Task RegisterPatient_NumericCustomField_InvalidInputs_ShouldThrowValidationException(string invalidValue)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var numDef = CreateActiveNumberDefinition("annual_income", "Annual Income");
        await defRepo.AddAsync(numDef);
        await uow.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            customFieldRepo: defRepo);

        var command = CreateRegisterCommand("Jose", "Rizal", new Dictionary<string, object?>
        {
            ["annual_income"] = invalidValue
        });

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("Annual Income must be a valid number.");
    }

    [Fact]
    public async Task RegisterPatient_NumericCustomField_ValidFormats_ShouldPersistSuccessfully()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var numDef = CreateActiveNumberDefinition("annual_income", "Annual Income");
        await defRepo.AddAsync(numDef);
        await uow.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            customFieldRepo: defRepo);

        var command = CreateRegisterCommand("Andres", "Bonifacio", new Dictionary<string, object?>
        {
            ["annual_income"] = "42500.50"
        });

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.CustomFields.Should().ContainKey("annual_income");
        result.CustomFields["annual_income"]!.ToString().Should().Be("42500.50");
    }

    [Fact]
    public async Task RegisterPatient_ClearedActiveField_ShouldBeOmittedFromPersistedEntity()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var numDef = CreateActiveNumberDefinition("annual_income", "Annual Income");
        var textDef = CreateActiveTextDefinition("notes", "Notes");
        await defRepo.AddAsync(numDef);
        await defRepo.AddAsync(textDef);
        await uow.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            customFieldRepo: defRepo);

        var command = CreateRegisterCommand("Emilio", "Aguinaldo", new Dictionary<string, object?>
        {
            ["annual_income"] = "",
            ["notes"] = "   ",
            ["untyped_key"] = "legacy_data"
        });

        var result = await handler.Handle(command, CancellationToken.None);

        result.CustomFields.Should().NotContainKey("annual_income");
        result.CustomFields.Should().NotContainKey("notes");
        result.CustomFields.Should().ContainKey("untyped_key");
        result.CustomFields["untyped_key"].Should().Be("legacy_data");
    }

    [Fact]
    public async Task RegisterPatient_NullCustomFieldRepo_MaintainsBackwardCompatibility()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Intentionally instantiate handler without customFieldRepo
        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext);

        var command = CreateRegisterCommand("Apolinario", "Mabini", new Dictionary<string, object?>
        {
            ["annual_income"] = "50000",
            ["custom_field"] = "legacy"
        });

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.CustomFields.Should().ContainKey("annual_income");
        result.CustomFields["annual_income"].Should().Be("50000");
    }

    // =========================================================================
    // TIER 3: UpdateClinicPatientCommand Integration Tests
    // =========================================================================

    [Fact]
    public async Task UpdatePatient_NumericField_InvalidInput_ShouldThrowValidationException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var numDef = CreateActiveNumberDefinition("student_gpa", "Student GPA");
        await defRepo.AddAsync(numDef);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0001",
            FirstName = "Juan",
            LastName = "Luna",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = "0918-000-0000",
            CustomFields = new Dictionary<string, object?> { ["student_gpa"] = "3.75" }
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            clinicContext: _clinicContext,
            customFieldRepo: defRepo);

        var updateCommand = new UpdateClinicPatientCommand(
            Id: patient.Id,
            FirstName: patient.FirstName,
            LastName: patient.LastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: patient.DateOfBirth,
            Gender: patient.Gender,
            CivilStatus: "Single",
            ContactNumber: patient.ContactNumber,
            Email: null,
            CustomFields: new Dictionary<string, object?> { ["student_gpa"] = "A" }
        );

        var act = async () => await handler.Handle(updateCommand, CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("Student GPA must be a valid number.");
    }

    [Fact]
    public async Task UpdatePatient_ClearActiveField_ShouldPurgeKeyFromPersistedEntity()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var numDef = CreateActiveNumberDefinition("annual_income", "Annual Income");
        await defRepo.AddAsync(numDef);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0002",
            FirstName = "Marcelo",
            LastName = "Del Pilar",
            DateOfBirth = new DateOnly(1985, 3, 15),
            Gender = "Male",
            ContactNumber = "0919-111-2222",
            CustomFields = new Dictionary<string, object?>
            {
                ["annual_income"] = 50000,
                ["member_type"] = "Indigent",
                ["philhealth_profile"] = "enrolled"
            }
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            clinicContext: _clinicContext,
            customFieldRepo: defRepo);

        // Update with annual_income cleared as empty string ""
        var updateCommand = new UpdateClinicPatientCommand(
            Id: patient.Id,
            FirstName: patient.FirstName,
            LastName: patient.LastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: patient.DateOfBirth,
            Gender: patient.Gender,
            CivilStatus: "Married",
            ContactNumber: patient.ContactNumber,
            Email: null,
            CustomFields: new Dictionary<string, object?>
            {
                ["annual_income"] = ""
            }
        );

        var result = await handler.Handle(updateCommand, CancellationToken.None);

        result.CustomFields.Should().NotContainKey("annual_income");
        result.CustomFields.Should().ContainKey("member_type");
        result.CustomFields["member_type"].Should().Be("Indigent");
        result.CustomFields.Should().ContainKey("philhealth_profile");
        result.CustomFields["philhealth_profile"].Should().Be("enrolled");
    }

    [Fact]
    public async Task UpdatePatient_ClearActiveField_WhitespaceOrNull_ShouldPurgeKey()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var numDef = CreateActiveNumberDefinition("student_gpa", "Student GPA");
        var textDef = CreateActiveTextDefinition("department", "Department");
        await defRepo.AddAsync(numDef);
        await defRepo.AddAsync(textDef);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0003",
            FirstName = "Melchora",
            LastName = "Aquino",
            DateOfBirth = new DateOnly(1970, 1, 6),
            Gender = "Female",
            ContactNumber = "0920-333-4444",
            CustomFields = new Dictionary<string, object?>
            {
                ["student_gpa"] = "3.85",
                ["department"] = "Nursing"
            }
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            clinicContext: _clinicContext,
            customFieldRepo: defRepo);

        var updateCommand = new UpdateClinicPatientCommand(
            Id: patient.Id,
            FirstName: patient.FirstName,
            LastName: patient.LastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: patient.DateOfBirth,
            Gender: patient.Gender,
            CivilStatus: "Widowed",
            ContactNumber: patient.ContactNumber,
            Email: null,
            CustomFields: new Dictionary<string, object?>
            {
                ["student_gpa"] = "   ", // whitespace string
                ["department"] = null    // null
            }
        );

        var result = await handler.Handle(updateCommand, CancellationToken.None);

        result.CustomFields.Should().NotContainKey("student_gpa");
        result.CustomFields.Should().NotContainKey("department");
    }

    [Fact]
    public async Task UpdatePatient_ValidNumericUpdate_PersistsSuccessfully()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var numDef = CreateActiveNumberDefinition("student_gpa", "Student GPA");
        await defRepo.AddAsync(numDef);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0004",
            FirstName = "Gregorio",
            LastName = "Del Pilar",
            DateOfBirth = new DateOnly(1995, 11, 14),
            Gender = "Male",
            ContactNumber = "0921-555-6666",
            CustomFields = new Dictionary<string, object?>
            {
                ["student_gpa"] = "3.75"
            }
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            clinicContext: _clinicContext,
            customFieldRepo: defRepo);

        var updateCommand = new UpdateClinicPatientCommand(
            Id: patient.Id,
            FirstName: patient.FirstName,
            LastName: patient.LastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: patient.DateOfBirth,
            Gender: patient.Gender,
            CivilStatus: "Single",
            ContactNumber: patient.ContactNumber,
            Email: null,
            CustomFields: new Dictionary<string, object?>
            {
                ["student_gpa"] = "3.95"
            }
        );

        var result = await handler.Handle(updateCommand, CancellationToken.None);

        result.CustomFields.Should().ContainKey("student_gpa");
        result.CustomFields["student_gpa"]!.ToString().Should().Be("3.95");
    }

    [Fact]
    public async Task UpdatePatient_InactiveDefinition_BypassesValidationAndRemoval()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var inactiveDef = new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            EntityType = "ClinicPatient",
            FieldKey = "inactive_number",
            Label = "Inactive Number",
            DataType = CustomFieldDataType.Number,
            IsActive = false
        };
        await defRepo.AddAsync(inactiveDef);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0005",
            FirstName = "Diego",
            LastName = "Silang",
            DateOfBirth = new DateOnly(1980, 12, 16),
            Gender = "Male",
            ContactNumber = "0922-777-8888",
            CustomFields = new Dictionary<string, object?>()
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            clinicContext: _clinicContext,
            customFieldRepo: defRepo);

        // Submitting non-numeric string for inactive definition should not throw
        var updateCommand = new UpdateClinicPatientCommand(
            Id: patient.Id,
            FirstName: patient.FirstName,
            LastName: patient.LastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: patient.DateOfBirth,
            Gender: patient.Gender,
            CivilStatus: "Single",
            ContactNumber: patient.ContactNumber,
            Email: null,
            CustomFields: new Dictionary<string, object?>
            {
                ["inactive_number"] = "A"
            }
        );

        var act = async () => await handler.Handle(updateCommand, CancellationToken.None);

        await act.Should().NotThrowAsync();
        var result = await handler.Handle(updateCommand, CancellationToken.None);
        result.CustomFields.Should().ContainKey("inactive_number");
        result.CustomFields["inactive_number"].Should().Be("A");
    }

    [Fact]
    public async Task UpdatePatient_TcIf006_HttpPutJsonNullTombstone_PurgesNumberOfDependentsAfterChangeTrackerClear()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var dependentsDef = CreateActiveNumberDefinition("number_of_dependents", "Number of Dependents");
        await defRepo.AddAsync(dependentsDef);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00001",
            FirstName = "Josh",
            LastName = "Gram",
            DateOfBirth = new DateOnly(1998, 6, 15),
            Gender = "Male",
            ContactNumber = "0917-000-0001",
            CustomFields = new Dictionary<string, object?>
            {
                ["number_of_dependents"] = "3",
                ["member_type"] = "MM",
                ["yakap_enlistments"] = new List<string> { "ENL-2026-01" }
            }
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            clinicContext: _clinicContext,
            customFieldRepo: defRepo);

        // Simulate System.Text.Json deserialization of EditPatientModal HTTP PUT payload with null tombstone
        var putPayload = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            "{\"number_of_dependents\":null,\"member_type\":\"MM\"}")!;

        var updateCommand = new UpdateClinicPatientCommand(
            Id: patient.Id,
            FirstName: patient.FirstName,
            LastName: patient.LastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: patient.DateOfBirth,
            Gender: patient.Gender,
            CivilStatus: "Single",
            ContactNumber: patient.ContactNumber,
            Email: null,
            CustomFields: putPayload
        );

        var dto = await handler.Handle(updateCommand, CancellationToken.None);
        dto.CustomFields.Should().NotContainKey("number_of_dependents");

        // Reload fresh from DbContext after ChangeTracker.Clear() to prove EF Core persisted removal
        context.ChangeTracker.Clear();
        var reloaded = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstAsync(
            patientRepo.Query(p => p.Id == patient.Id));
        reloaded.CustomFields.Should().NotContainKey("number_of_dependents");
        reloaded.CustomFields.Should().ContainKey("member_type");
        reloaded.CustomFields.Should().ContainKey("yakap_enlistments");
    }
}
