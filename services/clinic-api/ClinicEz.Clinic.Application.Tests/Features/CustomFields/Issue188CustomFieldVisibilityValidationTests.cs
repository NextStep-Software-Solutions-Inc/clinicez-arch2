using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.Templates;
using ClinicEz.Clinic.Application.Features.CustomFields.Validation;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.CustomFields;

public class Issue188CustomFieldVisibilityValidationTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_issue188_test";
    private readonly IClinicContext _clinicContext;

    public Issue188CustomFieldVisibilityValidationTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private static List<CustomFieldDefinition> CreateUniversityUstpDefinitions(string tenantId, Guid clinicId)
    {
        var template = ClinicCustomFieldTemplatesCatalog.GetTemplate(ClinicCustomFieldTemplatesCatalog.UniversityUstpKey);
        template.Should().NotBeNull();

        var list = new List<CustomFieldDefinition>();
        foreach (var field in template!.Fields)
        {
            list.Add(new CustomFieldDefinition
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                EntityType = "Patient",
                FieldKey = field.FieldKey,
                Label = field.Label,
                DataType = field.DataType,
                Category = field.Category,
                IsRequired = field.IsRequired,
                DisplayOrder = field.DisplayOrder,
                OptionsJson = field.OptionsJson,
                Placeholder = field.Placeholder,
                VisibilityRuleJson = field.VisibilityRuleJson,
                ConditionalOptionsJson = field.ConditionalOptionsJson,
                IsActive = true
            });
        }
        return list;
    }

    // =========================================================================
    // 1. IsFieldVisible Unit Tests
    // =========================================================================

    [Theory]
    [InlineData("Student", true, false)]
    [InlineData("Employee/Faculty", false, true)]
    [InlineData("Dependent", false, false)]
    [InlineData("Guest", false, false)]
    [InlineData("", false, false)]
    [InlineData(null, false, false)]
    public void IsFieldVisible_UniversityTemplate_EvaluatesBranchingAccurately(
        string? affiliation,
        bool expectedStudentIdVisible,
        bool expectedEmployeeIdVisible)
    {
        var defs = CreateUniversityUstpDefinitions(_tenantId, _clinicId);
        var studentIdDef = defs.Find(d => d.FieldKey == "student_id")!;
        var employeeIdDef = defs.Find(d => d.FieldKey == "employee_id")!;

        var values = new Dictionary<string, object?>();
        if (affiliation != null)
        {
            values["affiliation"] = affiliation;
        }

        var studentIdVisible = CustomFieldValueValidator.IsFieldVisible(studentIdDef, values);
        var employeeIdVisible = CustomFieldValueValidator.IsFieldVisible(employeeIdDef, values);

        studentIdVisible.Should().Be(expectedStudentIdVisible);
        employeeIdVisible.Should().Be(expectedEmployeeIdVisible);
    }

    [Fact]
    public void IsFieldVisible_StaticContext_SexAndCivilStatus_EvaluatesCorrectly()
    {
        var femaleOnlyDef = new CustomFieldDefinition
        {
            FieldKey = "is_pregnant",
            Label = "Is Pregnant",
            DataType = CustomFieldDataType.Boolean,
            VisibilityRuleJson = "{\"source\":\"static\",\"field\":\"sex\",\"operator\":\"equals\",\"value\":\"Female\"}"
        };

        var marriedOnlyDef = new CustomFieldDefinition
        {
            FieldKey = "spouse_name",
            Label = "Spouse Name",
            DataType = CustomFieldDataType.Text,
            VisibilityRuleJson = "{\"source\":\"static\",\"field\":\"civilStatus\",\"operator\":\"equals\",\"value\":\"Married\"}"
        };

        var femaleMarried = new PatientStaticContext(Sex: "Female", CivilStatus: "Married");
        var maleSingle = new PatientStaticContext(Sex: "Male", CivilStatus: "Single");

        CustomFieldValueValidator.IsFieldVisible(femaleOnlyDef, new Dictionary<string, object?>(), femaleMarried).Should().BeTrue();
        CustomFieldValueValidator.IsFieldVisible(femaleOnlyDef, new Dictionary<string, object?>(), maleSingle).Should().BeFalse();

        CustomFieldValueValidator.IsFieldVisible(marriedOnlyDef, new Dictionary<string, object?>(), femaleMarried).Should().BeTrue();
        CustomFieldValueValidator.IsFieldVisible(marriedOnlyDef, new Dictionary<string, object?>(), maleSingle).Should().BeFalse();
    }

    [Theory]
    [InlineData("{\"operator\":\"not_equals\",\"field\":\"affiliation\",\"value\":\"Guest\"}", "Student", true)]
    [InlineData("{\"operator\":\"not_equals\",\"field\":\"affiliation\",\"value\":\"Guest\"}", "Guest", false)]
    [InlineData("{\"operator\":\"in\",\"field\":\"affiliation\",\"value\":[\"Student\",\"Dependent\"]}", "Student", true)]
    [InlineData("{\"operator\":\"in\",\"field\":\"affiliation\",\"value\":[\"Student\",\"Dependent\"]}", "Employee/Faculty", false)]
    [InlineData("{\"operator\":\"contains\",\"field\":\"notes\",\"value\":\"urgent\"}", "very urgent case", true)]
    [InlineData("{\"operator\":\"contains\",\"field\":\"notes\",\"value\":\"urgent\"}", "routine visit", false)]
    [InlineData("{\"operator\":\"not_empty\",\"field\":\"referral_code\"}", "REF-123", true)]
    [InlineData("{\"operator\":\"not_empty\",\"field\":\"referral_code\"}", "", false)]
    [InlineData("{\"operator\":\"not_empty\",\"field\":\"referral_code\"}", null, false)]
    public void IsFieldVisible_Operators_WorkCorrectly(string ruleJson, string? fieldValue, bool expected)
    {
        var def = new CustomFieldDefinition
        {
            FieldKey = "child_field",
            Label = "Child Field",
            DataType = CustomFieldDataType.Text,
            VisibilityRuleJson = ruleJson
        };

        var values = new Dictionary<string, object?>();
        var ruleObj = JsonDocument.Parse(ruleJson).RootElement;
        var fieldName = ruleObj.GetProperty("field").GetString()!;
        if (fieldValue != null)
        {
            values[fieldName] = fieldValue;
        }

        CustomFieldValueValidator.IsFieldVisible(def, values).Should().Be(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("invalid json {[")]
    [InlineData("{}")]
    public void IsFieldVisible_MalformedOrEmptyRule_FailsOpenToVisible(string? malformedRule)
    {
        var def = new CustomFieldDefinition
        {
            FieldKey = "test_field",
            Label = "Test Field",
            DataType = CustomFieldDataType.Text,
            VisibilityRuleJson = malformedRule
        };

        CustomFieldValueValidator.IsFieldVisible(def, new Dictionary<string, object?>()).Should().BeTrue();
    }

    // =========================================================================
    // 2. ValidateAndNormalize Integration Tests (Patient Registration)
    // =========================================================================

    [Fact]
    public void ValidateAndNormalize_UniversityTemplate_Student_SucceedsWithoutEmployeeId()
    {
        var defs = CreateUniversityUstpDefinitions(_tenantId, _clinicId);
        var customFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "STU-2026-2757",
            ["college"] = "College of Information Technology and Computing",
            ["program"] = "BS Information Technology",
            ["year_level"] = "3rd Year"
        };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, defs);

        act.Should().NotThrow();
        customFields.Should().ContainKey("affiliation");
        customFields.Should().ContainKey("student_id");
        customFields.Should().ContainKey("college");
        customFields.Should().ContainKey("program");
        customFields.Should().NotContainKey("employee_id");
    }

    [Fact]
    public void ValidateAndNormalize_UniversityTemplate_Student_MissingStudentId_ThrowsValidationException()
    {
        var defs = CreateUniversityUstpDefinitions(_tenantId, _clinicId);
        var customFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["college"] = "College of Information Technology and Computing",
            ["program"] = "BS Information Technology"
        };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, defs);

        act.Should().Throw<ValidationException>()
            .WithMessage("Student ID / LRN is required.");
    }

    [Fact]
    public void ValidateAndNormalize_UniversityTemplate_Employee_SucceedsWithoutStudentId()
    {
        var defs = CreateUniversityUstpDefinitions(_tenantId, _clinicId);
        var customFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Employee/Faculty",
            ["employee_id"] = "EMP-9862",
            ["department"] = "Registrar Office"
        };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, defs);

        act.Should().NotThrow();
        customFields.Should().ContainKey("affiliation");
        customFields.Should().ContainKey("employee_id");
        customFields.Should().NotContainKey("student_id");
        customFields.Should().NotContainKey("college");
        customFields.Should().NotContainKey("program");
    }

    [Fact]
    public void ValidateAndNormalize_UniversityTemplate_Employee_MissingEmployeeId_ThrowsValidationException()
    {
        var defs = CreateUniversityUstpDefinitions(_tenantId, _clinicId);
        var customFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Employee/Faculty"
        };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, defs);

        act.Should().Throw<ValidationException>()
            .WithMessage("Employee ID is required.");
    }

    // =========================================================================
    // 3. MergeAndValidateForUpdate Integration Tests (Demographic Updates)
    // =========================================================================

    [Fact]
    public void MergeAndValidateForUpdate_UniversityTemplate_StudentUpdate_DoesNotBlockOnEmployeeId()
    {
        var defs = CreateUniversityUstpDefinitions(_tenantId, _clinicId);
        var targetFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "STU-2026-2757",
            ["college"] = "College of Information Technology and Computing",
            ["program"] = "BS Information Technology"
        };

        var submittedFields = new Dictionary<string, object?>
        {
            ["program"] = "BS Computer Science"
        };

        var act = () => CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        act.Should().NotThrow();
        targetFields["program"].Should().Be("BS Computer Science");
        targetFields.Should().NotContainKey("employee_id");
    }

    [Fact]
    public void MergeAndValidateForUpdate_SwitchAffiliation_StudentToEmployee_ClearsStudentFieldsAndRequiresEmployeeId()
    {
        var defs = CreateUniversityUstpDefinitions(_tenantId, _clinicId);
        var targetFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "STU-2026-2757",
            ["college"] = "College of Information Technology and Computing",
            ["program"] = "BS Information Technology"
        };

        // When switching to Employee, frontend sends null tombstone for student_id and new employee_id
        var submittedFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Employee/Faculty",
            ["student_id"] = null,
            ["college"] = null,
            ["program"] = null,
            ["employee_id"] = "EMP-9862"
        };

        var act = () => CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        act.Should().NotThrow();
        targetFields["affiliation"].Should().Be("Employee/Faculty");
        targetFields["employee_id"].Should().Be("EMP-9862");
        targetFields.Should().NotContainKey("student_id");
        targetFields.Should().NotContainKey("college");
        targetFields.Should().NotContainKey("program");
    }

    [Fact]
    public void MergeAndValidateForUpdate_SwitchAffiliation_StudentToEmployee_MissingEmployeeId_ThrowsValidationException()
    {
        var defs = CreateUniversityUstpDefinitions(_tenantId, _clinicId);
        var targetFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "STU-2026-2757",
            ["college"] = "College of Information Technology and Computing",
            ["program"] = "BS Information Technology"
        };

        var submittedFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Employee/Faculty",
            ["student_id"] = null
        };

        var act = () => CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        act.Should().Throw<ValidationException>()
            .WithMessage("Employee ID is required.");
    }
}
