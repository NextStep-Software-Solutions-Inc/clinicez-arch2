using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.CustomFields.Templates;
using ClinicEz.Clinic.Application.Features.CustomFields.Validation;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.CustomFields;

public class Issue204DemographicUpdateGrandfatheringTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_issue204_test";

    private List<CustomFieldDefinition> CreateUniversityUstpDefinitions()
    {
        var template = ClinicCustomFieldTemplatesCatalog.GetTemplate(ClinicCustomFieldTemplatesCatalog.UniversityUstpKey);
        template.Should().NotBeNull();

        var list = new List<CustomFieldDefinition>();
        foreach (var field in template!.Fields)
        {
            list.Add(new CustomFieldDefinition
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
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

    [Fact]
    public void MergeAndValidateForUpdate_SeededStudent_MissingAffiliationCollegeProgram_Succeeds()
    {
        // Arrange: Existing seeded student patient with student_id, but missing affiliation, college, program
        var defs = CreateUniversityUstpDefinitions();
        var targetFields = new Dictionary<string, object?>
        {
            ["classification"] = "Student",
            ["student_id"] = "STU-2026-1991",
            ["primary_address_line"] = "123 Main St",
            ["seeded_batch"] = "scale_test_1000"
        };

        // Staff updates demographic field (e.g. contact number or secondary address)
        var submittedFields = new Dictionary<string, object?>
        {
            ["emergency_contact_phone"] = "0917-123-4567"
        };

        // Act
        var act = () => CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        // Assert: Must not throw validation exception, and must preserve existing data
        act.Should().NotThrow();
        targetFields["student_id"].Should().Be("STU-2026-1991");
        targetFields["emergency_contact_phone"].Should().Be("0917-123-4567");
    }

    [Fact]
    public void MergeAndValidateForUpdate_SeededEmployee_MissingAffiliation_Succeeds()
    {
        // Arrange: Existing seeded employee patient with employee_id, but missing affiliation
        var defs = CreateUniversityUstpDefinitions();
        var targetFields = new Dictionary<string, object?>
        {
            ["classification"] = "Employee",
            ["employee_id"] = "EMP-2026-4432",
            ["workplace"] = "Cagayan de Oro"
        };

        var submittedFields = new Dictionary<string, object?>
        {
            ["primary_city"] = "Cagayan de Oro"
        };

        // Act
        var act = () => CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        // Assert
        act.Should().NotThrow();
        targetFields["employee_id"].Should().Be("EMP-2026-4432");
        targetFields["primary_city"].Should().Be("Cagayan de Oro");
    }

    [Fact]
    public void MergeAndValidateForUpdate_SeededGeneral_MissingAffiliation_Succeeds()
    {
        // Arrange: Existing seeded general patient (no student_id, no employee_id, no affiliation)
        var defs = CreateUniversityUstpDefinitions();
        var targetFields = new Dictionary<string, object?>
        {
            ["classification"] = "General",
            ["category"] = "General",
            ["workplace"] = "Davao City"
        };

        var submittedFields = new Dictionary<string, object?>
        {
            ["workplace"] = "Cebu City"
        };

        // Act
        var act = () => CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        // Assert
        act.Should().NotThrow();
        targetFields["workplace"].Should().Be("Cebu City");
    }

    [Fact]
    public void MergeAndValidateForUpdate_EmptySubmittedCustomFields_SucceedsForLegacyPatient()
    {
        // Arrange: User updates non-custom demographic property (e.g. BloodType) passing empty customFields
        var defs = CreateUniversityUstpDefinitions();
        var targetFields = new Dictionary<string, object?>
        {
            ["classification"] = "Student",
            ["student_id"] = "STU-2026-1991"
        };

        var submittedFields = new Dictionary<string, object?>();

        // Act
        var act = () => CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        // Assert: Empty submitted dictionary should immediately succeed without blocking
        act.Should().NotThrow();
        targetFields["student_id"].Should().Be("STU-2026-1991");
    }

    [Fact]
    public void MergeAndValidateForUpdate_ExplicitlyClearingPreviouslyPopulatedRequiredField_ThrowsWithFieldKey()
    {
        // Arrange: Patient previously had student_id populated
        var defs = CreateUniversityUstpDefinitions();
        var targetFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "STU-2026-1991",
            ["college"] = "College of Information Technology and Computing",
            ["program"] = "BS Information Technology"
        };

        // User clears student_id
        var submittedFields = new Dictionary<string, object?>
        {
            ["student_id"] = ""
        };

        // Act
        var act = () => CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        // Assert: Must throw ValidationException with field key in Errors dictionary
        var ex = act.Should().Throw<ValidationException>().Which;
        ex.Message.Should().Be("Student ID / LRN is required.");
        ex.Errors.Should().NotBeNull();
        ex.Errors.Should().ContainKey("student_id");
        ex.Errors!["student_id"].Should().Contain("Student ID / LRN is required.");
    }

    [Fact]
    public void MergeAndValidateForUpdate_SwitchAffiliation_StudentToEmployee_WithoutEmployeeId_ThrowsWithFieldKey()
    {
        // Arrange: Switching affiliation causes employee_id to become newly visible
        var defs = CreateUniversityUstpDefinitions();
        var targetFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "STU-2026-1991",
            ["college"] = "College of Information Technology and Computing",
            ["program"] = "BS Information Technology"
        };

        var submittedFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Employee/Faculty"
            // employee_id is omitted!
        };

        // Act
        var act = () => CustomFieldValueValidator.MergeAndValidateForUpdate(targetFields, submittedFields, defs);

        // Assert
        var ex = act.Should().Throw<ValidationException>().Which;
        ex.Message.Should().Be("Employee ID is required.");
        ex.Errors.Should().NotBeNull();
        ex.Errors.Should().ContainKey("employee_id");
        ex.Errors!["employee_id"].Should().Contain("Employee ID is required.");
    }

    [Fact]
    public void ValidateAndNormalize_NewRegistration_EnforcesAllVisibleRequiredFieldsWithFieldKey()
    {
        // Arrange: New patient registration requires visible required fields
        var defs = CreateUniversityUstpDefinitions();
        var customFields = new Dictionary<string, object?>
        {
            ["emergency_contact_name"] = "Jane Doe"
            // affiliation missing!
        };

        // Act
        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, defs);

        // Assert
        var ex = act.Should().Throw<ValidationException>().Which;
        ex.Message.Should().Be("Affiliation is required.");
        ex.Errors.Should().NotBeNull();
        ex.Errors.Should().ContainKey("affiliation");
        ex.Errors!["affiliation"].Should().Contain("Affiliation is required.");
    }

    [Fact]
    public void ValidateAndNormalize_NewStudentRegistration_EnforcesStudentRequiredFields()
    {
        var defs = CreateUniversityUstpDefinitions();
        var customFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "2026-00123"
            // college is missing!
        };

        var act = () => CustomFieldValueValidator.ValidateAndNormalize(customFields, defs);

        var ex = act.Should().Throw<ValidationException>().Which;
        ex.Message.Should().Be("College / Faculty is required.");
        ex.Errors.Should().NotBeNull();
        ex.Errors.Should().ContainKey("college");
    }

    [Fact]
    public async Task HasAnyPermissionAttribute_AllowsWhenCallerHasPatientsReadOrSettingsRead()
    {
        var attr = new HasAnyPermissionAttribute(ClinicPermissions.SettingsRead, ClinicPermissions.PatientsRead);

        // Case 1: Caller has PatientsRead but not SettingsRead (e.g. Doctor, Nurse, Receptionist)
        var doctorContext = Substitute.For<IClinicContext>();
        doctorContext.HasPermission(ClinicPermissions.SettingsRead).Returns(false);
        doctorContext.HasPermission(ClinicPermissions.PatientsRead).Returns(true);

        var services = new ServiceCollection().AddSingleton(doctorContext).BuildServiceProvider();
        var httpContext = new DefaultHttpContext { RequestServices = services };
        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        var executingContext = new ActionExecutingContext(
            actionContext,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            controller: new object());

        var nextCalled = false;
        await attr.OnActionExecutionAsync(executingContext, () =>
        {
            nextCalled = true;
            return Task.FromResult(new ActionExecutedContext(actionContext, new List<IFilterMetadata>(), new object()));
        });

        nextCalled.Should().BeTrue();
        executingContext.Result.Should().BeNull();
    }

    [Fact]
    public async Task HasAnyPermissionAttribute_RejectsWhenCallerHasNeitherPermission()
    {
        var attr = new HasAnyPermissionAttribute(ClinicPermissions.SettingsRead, ClinicPermissions.PatientsRead);

        // Case 2: Caller has neither SettingsRead nor PatientsRead
        var unauthorizedContext = Substitute.For<IClinicContext>();
        unauthorizedContext.HasPermission(ClinicPermissions.SettingsRead).Returns(false);
        unauthorizedContext.HasPermission(ClinicPermissions.PatientsRead).Returns(false);

        var services = new ServiceCollection().AddSingleton(unauthorizedContext).BuildServiceProvider();
        var httpContext = new DefaultHttpContext { RequestServices = services };
        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        var executingContext = new ActionExecutingContext(
            actionContext,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            controller: new object());

        var nextCalled = false;
        await attr.OnActionExecutionAsync(executingContext, () =>
        {
            nextCalled = true;
            return Task.FromResult(new ActionExecutedContext(actionContext, new List<IFilterMetadata>(), new object()));
        });

        nextCalled.Should().BeFalse();
        executingContext.Result.Should().BeOfType<ObjectResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }
}
