using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.Validation;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Challenger 2: Backend Adversarial Empirical Stress Test Suite for Issue #76.
/// Empirically stress-tests:
/// 1. JsonElement variants (Object, Array, Boolean, Null, Undefined, String number, String non-numeric, Whitespace, Scientific notation).
/// 2. Numeric edge cases, zero semantics, extreme values, NaN/Infinity protection, and non-numeric primitives.
/// 3. ValidationException throwing with exact message "<Label> must be a valid number.".
/// 4. Active definition clearance & case-insensitive key purge on update.
/// 5. Untyped key roundtrip invariance and non-validation preservation.
/// 6. Multi-tenant / clinic isolation and multi-threaded concurrency safety.
/// </summary>
public class ChallengerIssue76BackendStressTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_adv_issue76";
    private readonly IClinicContext _clinicContext;

    public ChallengerIssue76BackendStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private ClinicCustomFieldDefinition CreateDefinition(
        string key,
        string label,
        CustomFieldDataType dataType = CustomFieldDataType.Number,
        bool isActive = true,
        string entityType = "ClinicPatient",
        Guid? clinicId = null,
        string? tenantId = null)
    {
        return new ClinicCustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId ?? _tenantId,
            ClinicId = clinicId ?? _clinicId,
            EntityType = entityType,
            FieldKey = key,
            Label = label,
            DataType = dataType,
            IsActive = isActive
        };
    }

    private RegisterClinicPatientCommand CreateRegisterCommand(string firstName, string lastName, Dictionary<string, object?> customFields) =>
        new(
            FirstName: firstName,
            LastName: lastName,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1992, 4, 12),
            Gender: "Male",
            CivilStatus: "Single",
            ContactNumber: "0917-555-0101",
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
    // SECTION 1: JsonElement Polymorphism & Fuzzing
    // =========================================================================

    [Fact]
    public void JsonElement_Object_ShouldThrowValidationException()
    {
        var def = CreateDefinition("annual_income", "Annual Income");
        using var doc = JsonDocument.Parse("{\"nested\": {\"foo\": \"bar\"}}");
        var customFields = new Dictionary<string, object?> { ["annual_income"] = doc.RootElement };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        act.Should().Throw<ValidationException>()
            .WithMessage("Annual Income must be a valid number.");
    }

    [Fact]
    public void JsonElement_Array_ShouldThrowValidationException()
    {
        var def = CreateDefinition("annual_income", "Annual Income");
        using var doc = JsonDocument.Parse("[10, 20, 30]");
        var customFields = new Dictionary<string, object?> { ["annual_income"] = doc.RootElement };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        act.Should().Throw<ValidationException>()
            .WithMessage("Annual Income must be a valid number.");
    }

    [Theory]
    [InlineData("true")]
    [InlineData("false")]
    public void JsonElement_Boolean_ShouldThrowValidationException(string boolJson)
    {
        var def = CreateDefinition("annual_income", "Annual Income");
        using var doc = JsonDocument.Parse(boolJson);
        var customFields = new Dictionary<string, object?> { ["annual_income"] = doc.RootElement };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        act.Should().Throw<ValidationException>()
            .WithMessage("Annual Income must be a valid number.");
    }

    [Fact]
    public void JsonElement_Null_ShouldPurgeActiveDefinitionKey()
    {
        var def = CreateDefinition("annual_income", "Annual Income");
        using var doc = JsonDocument.Parse("null");
        var customFields = new Dictionary<string, object?> { ["annual_income"] = doc.RootElement };

        CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        customFields.Should().NotContainKey("annual_income");
    }

    [Fact]
    public void JsonElement_Undefined_ShouldPurgeActiveDefinitionKey()
    {
        var def = CreateDefinition("annual_income", "Annual Income");
        var undefinedElement = default(JsonElement);
        var customFields = new Dictionary<string, object?> { ["annual_income"] = undefinedElement };

        CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        customFields.Should().NotContainKey("annual_income");
    }

    [Theory]
    [InlineData("\"123.45\"", "123.45")]
    [InlineData("\"0\"", "0")]
    [InlineData("\"-42\"", "-42")]
    [InlineData("\"-0.001\"", "-0.001")]
    public void JsonElement_ValidNumericString_ShouldBeAcceptedAndNormalized(string jsonStr, string expected)
    {
        var def = CreateDefinition("annual_income", "Annual Income");
        using var doc = JsonDocument.Parse(jsonStr);
        var customFields = new Dictionary<string, object?> { ["annual_income"] = doc.RootElement };

        CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        customFields.Should().ContainKey("annual_income");
        customFields["annual_income"]!.ToString().Should().Be(expected);
    }

    [Theory]
    [InlineData("\"12a\"")]
    [InlineData("\"!$#%\"")]
    [InlineData("\"abc\"")]
    [InlineData("\"12.34.56\"")]
    [InlineData("\"--5\"")]
    [InlineData("\"5-\"")]
    [InlineData("\".\"")]
    [InlineData("\"-.\"")]
    public void JsonElement_InvalidString_ShouldThrowValidationException(string jsonStr)
    {
        var def = CreateDefinition("student_gpa", "Student GPA");
        using var doc = JsonDocument.Parse(jsonStr);
        var customFields = new Dictionary<string, object?> { ["student_gpa"] = doc.RootElement };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        act.Should().Throw<ValidationException>()
            .WithMessage("Student GPA must be a valid number.");
    }

    [Fact]
    public void JsonElement_StringWithLeadingTrailingWhitespace_ShouldBeAcceptedAndTrimmed()
    {
        var def = CreateDefinition("annual_income", "Annual Income");
        using var doc = JsonDocument.Parse("\"  42.0  \"");
        var customFields = new Dictionary<string, object?> { ["annual_income"] = doc.RootElement };

        CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        customFields.Should().ContainKey("annual_income");
        customFields["annual_income"].Should().Be("42.0");
    }

    [Fact]
    public void JsonElement_WhitespaceOnlyString_ShouldPurgeActiveDefinitionKey()
    {
        var def = CreateDefinition("annual_income", "Annual Income");
        using var doc = JsonDocument.Parse("\"     \"");
        var customFields = new Dictionary<string, object?> { ["annual_income"] = doc.RootElement };

        CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        customFields.Should().NotContainKey("annual_income");
    }

    [Theory]
    [InlineData("\"1e6\"")]
    [InlineData("\"1E6\"")]
    [InlineData("\"2.5e-3\"")]
    [InlineData("\"1e+10\"")]
    public void ScientificNotation_InString_ShouldBeRejectedByRegex(string scientificStringJson)
    {
        var def = CreateDefinition("measurement", "Measurement");
        using var doc = JsonDocument.Parse(scientificStringJson);
        var customFields = new Dictionary<string, object?> { ["measurement"] = doc.RootElement };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        act.Should().Throw<ValidationException>()
            .WithMessage("Measurement must be a valid number.");
    }

    [Fact]
    public void ScientificNotation_InJsonNumber_ShouldBeParsedAsNumericKind()
    {
        var def = CreateDefinition("measurement", "Measurement");
        using var doc = JsonDocument.Parse("1e6");
        var customFields = new Dictionary<string, object?> { ["measurement"] = doc.RootElement };

        CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        customFields.Should().ContainKey("measurement");
        customFields["measurement"].Should().Be(1000000L);
    }

    // =========================================================================
    // SECTION 2: Numeric Edge Cases & Extreme Values
    // =========================================================================

    [Fact]
    public void NumericZero_PrimitiveVariants_AreValidAndNeverPurged()
    {
        var def = CreateDefinition("zero_metric", "Zero Metric");
        var zeroValues = new object[] { 0, 0.0, -0.0, 0L, 0m, (short)0, (byte)0 };

        foreach (var zeroVal in zeroValues)
        {
            var customFields = new Dictionary<string, object?> { ["zero_metric"] = zeroVal };
            CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

            customFields.Should().ContainKey("zero_metric");
            customFields["zero_metric"].Should().Be(zeroVal);
        }
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-0")]
    [InlineData("0.0")]
    [InlineData("-0.0")]
    [InlineData("00")]
    [InlineData("0.00")]
    public void NumericZero_StringVariants_AreValidAndNeverPurged(string zeroStr)
    {
        var def = CreateDefinition("zero_metric", "Zero Metric");
        var customFields = new Dictionary<string, object?> { ["zero_metric"] = zeroStr };

        CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        customFields.Should().ContainKey("zero_metric");
        customFields["zero_metric"].Should().Be(zeroStr);
    }

    [Fact]
    public void ExtremeNumericValues_Primitives_ShouldBeAccepted()
    {
        var defs = new[]
        {
            CreateDefinition("dec_max", "Decimal Max"),
            CreateDefinition("dec_min", "Decimal Min"),
            CreateDefinition("long_max", "Long Max"),
            CreateDefinition("long_min", "Long Min"),
            CreateDefinition("ulong_max", "ULong Max"),
            CreateDefinition("int_max", "Int Max"),
            CreateDefinition("int_min", "Int Min"),
            CreateDefinition("short_min", "Short Min"),
            CreateDefinition("short_max", "Short Max"),
            CreateDefinition("byte_max", "Byte Max"),
            CreateDefinition("sbyte_min", "SByte Min"),
            CreateDefinition("double_max", "Double Max")
        };

        var customFields = new Dictionary<string, object?>
        {
            ["dec_max"] = decimal.MaxValue,
            ["dec_min"] = decimal.MinValue,
            ["long_max"] = long.MaxValue,
            ["long_min"] = long.MinValue,
            ["ulong_max"] = ulong.MaxValue,
            ["int_max"] = int.MaxValue,
            ["int_min"] = int.MinValue,
            ["short_min"] = short.MinValue,
            ["short_max"] = short.MaxValue,
            ["byte_max"] = byte.MaxValue,
            ["sbyte_min"] = sbyte.MinValue,
            ["double_max"] = double.MaxValue
        };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, defs);

        act.Should().NotThrow();
        customFields["dec_max"].Should().Be(decimal.MaxValue);
        customFields["long_min"].Should().Be(long.MinValue);
        customFields["double_max"].Should().Be(double.MaxValue);
    }

    [Fact]
    public void DoubleAndFloat_NaNAndInfinity_ShouldThrowValidationException()
    {
        var def = CreateDefinition("float_metric", "Float Metric");

        var testCases = new object[]
        {
            double.NaN,
            float.NaN,
            double.PositiveInfinity,
            double.NegativeInfinity,
            float.PositiveInfinity,
            float.NegativeInfinity
        };

        foreach (var invalidVal in testCases)
        {
            var dict = new Dictionary<string, object?> { ["float_metric"] = invalidVal };
            var act = () => CustomFieldValueValidator.ValidateAndNormalize(dict, new[] { def });
            act.Should().Throw<ValidationException>()
                .WithMessage("Float Metric must be a valid number.");
        }
    }

    [Theory]
    [InlineData("NaN")]
    [InlineData("Infinity")]
    [InlineData("-Infinity")]
    [InlineData("+Infinity")]
    public void SpecialFloatStrings_ShouldThrowValidationException(string floatStr)
    {
        var def = CreateDefinition("float_metric", "Float Metric");
        var dict = new Dictionary<string, object?> { ["float_metric"] = floatStr };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(dict, new[] { def });

        act.Should().Throw<ValidationException>()
            .WithMessage("Float Metric must be a valid number.");
    }

    [Fact]
    public void GiganticStringCausingFloatOverflow_ShouldThrowValidationException()
    {
        var def = CreateDefinition("overflow_metric", "Overflow Metric");
        // 400 digits overflows IEEE double max (~1.79e308) to Infinity
        var hugeNumberStr = "1" + new string('0', 400);
        var dict = new Dictionary<string, object?> { ["overflow_metric"] = hugeNumberStr };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(dict, new[] { def });

        act.Should().Throw<ValidationException>()
            .WithMessage("Overflow Metric must be a valid number.");
    }

    [Fact]
    public void NonNumericPrimitives_ShouldThrowValidationException()
    {
        var def = CreateDefinition("bad_primitive", "Bad Primitive");

        var nonNumericInputs = new object[]
        {
            DateTime.UtcNow,
            DateOnly.FromDateTime(DateTime.UtcNow),
            Guid.NewGuid(),
            new byte[] { 1, 2, 3 },
            'A',
            TimeSpan.FromMinutes(10),
            true,
            false,
            new { foo = "bar" },
            new List<int> { 1, 2, 3 }
        };

        foreach (var input in nonNumericInputs)
        {
            var dict = new Dictionary<string, object?> { ["bad_primitive"] = input };
            var act = () => CustomFieldValueValidator.ValidateAndNormalize(dict, new[] { def });
            act.Should().Throw<ValidationException>(because: $"Input of type {input.GetType().Name} must not be accepted as number")
                .WithMessage("Bad Primitive must be a valid number.");
        }
    }

    // =========================================================================
    // SECTION 3: Exact ValidationException Message Invariance
    // =========================================================================

    [Theory]
    [InlineData("Annual Income", "Annual Income must be a valid number.")]
    [InlineData("Student GPA", "Student GPA must be a valid number.")]
    [InlineData("BMI (kg/m²)", "BMI (kg/m²) must be a valid number.")]
    [InlineData("Body Temp (°C)", "Body Temp (°C) must be a valid number.")]
    [InlineData("Score / 100", "Score / 100 must be a valid number.")]
    public void ValidationException_ExactMessage_PreservesLabelVerbatim(string label, string expectedMessage)
    {
        var def = CreateDefinition("test_field", label);
        var dict = new Dictionary<string, object?> { ["test_field"] = "not-a-number" };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(dict, new[] { def });

        act.Should().Throw<ValidationException>()
            .WithMessage(expectedMessage);
    }

    // =========================================================================
    // SECTION 4: Active Definition Clearance & Case-Insensitive Key Purge
    // =========================================================================

    [Fact]
    public void MergeAndValidateForUpdate_ClearsActiveKeysAcrossDataTypes()
    {
        var targetFields = new Dictionary<string, object?>
        {
            ["num_field"] = 100,
            ["text_field"] = "Existing text",
            ["date_field"] = "2026-01-01",
            ["bool_field"] = true,
            ["select_field"] = "OptionA",
            ["untyped_field"] = "Stay untouched"
        };

        var defs = new[]
        {
            CreateDefinition("num_field", "Number Field", CustomFieldDataType.Number),
            CreateDefinition("text_field", "Text Field", CustomFieldDataType.Text),
            CreateDefinition("date_field", "Date Field", CustomFieldDataType.Date),
            CreateDefinition("bool_field", "Bool Field", CustomFieldDataType.Boolean),
            CreateDefinition("select_field", "Select Field", CustomFieldDataType.Select)
        };

        var submittedFields = new Dictionary<string, object?>
        {
            ["num_field"] = "",
            ["text_field"] = "   ",
            ["date_field"] = null,
            ["select_field"] = JsonDocument.Parse("null").RootElement
        };

        CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        targetFields.Should().NotContainKey("num_field");
        targetFields.Should().NotContainKey("text_field");
        targetFields.Should().NotContainKey("date_field");
        targetFields.Should().NotContainKey("select_field");

        // bool_field was not in submittedFields, so it must remain
        targetFields.Should().ContainKey("bool_field");
        targetFields["bool_field"].Should().Be(true);

        // untyped_field was not touched
        targetFields.Should().ContainKey("untyped_field");
        targetFields["untyped_field"].Should().Be("Stay untouched");
    }

    [Fact]
    public void MergeAndValidateForUpdate_CaseInsensitivePurge_CleansesExistingCaseVariants()
    {
        var targetFields = new Dictionary<string, object?>
        {
            ["annual_income"] = 50000,
            ["other_data"] = "preserve"
        };

        var def = CreateDefinition("annual_income", "Annual Income");

        // Submitting uppercase key with cleared value
        var submittedFields = new Dictionary<string, object?>
        {
            ["ANNUAL_INCOME"] = ""
        };

        CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, new[] { def });

        targetFields.Should().NotContainKey("annual_income");
        targetFields.Should().NotContainKey("ANNUAL_INCOME");
        targetFields.Should().ContainKey("other_data");
    }

    [Fact]
    public void MergeAndValidateForUpdate_CaseInsensitiveUpdate_CanonicalizesKeyToDefinition()
    {
        var targetFields = new Dictionary<string, object?>
        {
            ["Annual_Income"] = 50000
        };

        var def = CreateDefinition("annual_income", "Annual Income");

        var submittedFields = new Dictionary<string, object?>
        {
            ["ANNUAL_INCOME"] = "75000.50"
        };

        CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, new[] { def });

        targetFields.Should().NotContainKey("Annual_Income");
        targetFields.Should().NotContainKey("ANNUAL_INCOME");
        targetFields.Should().ContainKey("annual_income");
        targetFields["annual_income"].Should().Be("75000.50");
    }

    // =========================================================================
    // SECTION 5: Untyped Keys Invariance & Roundtrip Preservation
    // =========================================================================

    [Fact]
    public void UntypedKeys_NullAndWhitespace_MustNotBePurged()
    {
        var targetFields = new Dictionary<string, object?>
        {
            ["active_num"] = 12345
        };

        var def = CreateDefinition("active_num", "Active Number");

        var submittedFields = new Dictionary<string, object?>
        {
            ["untyped_null"] = null,
            ["untyped_empty"] = "",
            ["untyped_spaces"] = "   ",
            ["untyped_number"] = "not a number but untyped!",
            ["untyped_obj"] = new { foo = "bar" }
        };

        CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, new[] { def });

        targetFields.Should().ContainKey("active_num");
        targetFields["active_num"].Should().Be(12345);

        targetFields.Should().ContainKey("untyped_null");
        targetFields["untyped_null"].Should().BeNull();

        targetFields.Should().ContainKey("untyped_empty");
        targetFields["untyped_empty"].Should().Be("");

        targetFields.Should().ContainKey("untyped_spaces");
        targetFields["untyped_spaces"].Should().Be("   ");

        targetFields.Should().ContainKey("untyped_number");
        targetFields["untyped_number"].Should().Be("not a number but untyped!");

        targetFields.Should().ContainKey("untyped_obj");
    }

    [Fact]
    public void ValidateAndNormalize_UntypedKeys_PreservesArbitraryValuesWithoutValidation()
    {
        var def = CreateDefinition("active_num", "Active Number");

        var customFields = new Dictionary<string, object?>
        {
            ["active_num"] = 999,
            ["untyped_symbol"] = "!@#$%^&*",
            ["untyped_date"] = "invalid-date-string",
            ["untyped_bool"] = "not_bool",
            ["legacy_blob"] = "{\"raw\": true}"
        };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, new[] { def });

        act.Should().NotThrow();
        customFields["active_num"].Should().Be(999);
        customFields["untyped_symbol"].Should().Be("!@#$%^&*");
        customFields["untyped_date"].Should().Be("invalid-date-string");
        customFields["legacy_blob"].Should().Be("{\"raw\": true}");
    }

    // =========================================================================
    // SECTION 6: End-to-End Command Invariants & Database Isolation
    // =========================================================================

    [Fact]
    public async Task RegisterPatient_InvalidNumberField_RejectsBeforeDatabaseWrite()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var numDef = CreateDefinition("tuition_fee", "Tuition Fee");
        await defRepo.AddAsync(numDef);
        await uow.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            customFieldRepo: defRepo);

        var command = CreateRegisterCommand("Juan", "Dela Cruz", new Dictionary<string, object?>
        {
            ["tuition_fee"] = "fifteen_thousand"
        });

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("Tuition Fee must be a valid number.");

        // Assert database has zero patients
        var count = await patientRepo.Query().CountAsync();
        count.Should().Be(0);
    }

    [Fact]
    public async Task UpdatePatient_InvalidNumberField_RollsBackDatabaseAndThrows()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var numDef = CreateDefinition("tuition_fee", "Tuition Fee");
        await defRepo.AddAsync(numDef);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-9999",
            FirstName = "Maria",
            LastName = "Clara",
            DateOfBirth = new DateOnly(1996, 7, 10),
            Gender = "Female",
            ContactNumber = "0917-888-9999",
            CustomFields = new Dictionary<string, object?> { ["tuition_fee"] = 15000 }
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            clinicContext: _clinicContext,
            customFieldRepo: defRepo);

        var updateCmd = new UpdateClinicPatientCommand(
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
            CustomFields: new Dictionary<string, object?> { ["tuition_fee"] = "invalid_fee" }
        );

        var act = async () => await handler.Handle(updateCmd, CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("Tuition Fee must be a valid number.");

        // Verify entity in DB was untouched
        var reload = await patientRepo.Query(p => p.Id == patient.Id).FirstAsync();
        reload.CustomFields.Should().ContainKey("tuition_fee");
        reload.CustomFields["tuition_fee"].Should().Be(15000);
    }

    [Fact]
    public async Task MultiTenantAndClinic_DefinitionIsolation()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var defRepo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var otherClinicId = Guid.NewGuid();
        // Number definition belonging to ANOTHER clinic
        var otherClinicDef = CreateDefinition("score", "Score", CustomFieldDataType.Number, clinicId: otherClinicId);
        await defRepo.AddAsync(otherClinicDef);
        await uow.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            customFieldRepo: defRepo);

        // Submitting non-numeric string for "score", which is only a Number in another clinic!
        var command = CreateRegisterCommand("Crisostomo", "Ibarra", new Dictionary<string, object?>
        {
            ["score"] = "not_validated_in_current_clinic"
        });

        // Should NOT throw because definition is scoped out by multi-tenant query filter
        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public void MultiThreaded_ValidationSafety_ConcurrentExecutionsDoNotCorruptState()
    {
        var defs = new[]
        {
            CreateDefinition("num_1", "Number 1"),
            CreateDefinition("num_2", "Number 2"),
            CreateDefinition("text_1", "Text 1", CustomFieldDataType.Text)
        };

        Parallel.For(0, 100, i =>
        {
            var dict = new Dictionary<string, object?>
            {
                ["num_1"] = (i * 1.5).ToString(),
                ["num_2"] = i % 2 == 0 ? (object)i : "   ",
                ["text_1"] = i % 3 == 0 ? "some text" : "",
                ["untyped"] = "roundtrip"
            };

            CustomFieldValueValidator.ValidateAndNormalize(dict, defs);

            dict.Should().ContainKey("num_1");
            dict["untyped"].Should().Be("roundtrip");

            if (i % 2 != 0)
            {
                dict.Should().NotContainKey("num_2");
            }
            if (i % 3 != 0)
            {
                dict.Should().NotContainKey("text_1");
            }
        });
    }
}
