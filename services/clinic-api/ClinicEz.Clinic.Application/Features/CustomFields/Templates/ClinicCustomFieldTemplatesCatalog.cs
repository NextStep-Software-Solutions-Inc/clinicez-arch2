using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.CustomFields.Templates;

public static class ClinicCustomFieldTemplatesCatalog
{
    public const string UniversityUstpKey = "university_ustp";
    public const string WorkplaceCorporateKey = "workplace_corporate";
    public const string GeneralDemographicsKey = "general_demographics";

    private static readonly IReadOnlyList<CustomFieldTemplateDto> _templates = new List<CustomFieldTemplateDto>
    {
        CreateUniversityUstpTemplate(),
        CreateWorkplaceCorporateTemplate(),
        CreateGeneralDemographicsTemplate()
    };

    public static IReadOnlyList<CustomFieldTemplateDto> AllTemplates => _templates;

    public static IReadOnlyList<CustomFieldTemplateDto> GetAllTemplates(string? entityType = null)
    {
        if (string.IsNullOrWhiteSpace(entityType))
            return _templates;

        return _templates.Where(t => string.Equals(t.EntityType, entityType.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
    }

    public static CustomFieldTemplateDto? GetTemplate(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return null;
        return _templates.FirstOrDefault(t => string.Equals(t.Key, key.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    private static CustomFieldTemplateDto CreateUniversityUstpTemplate()
    {
        var fields = new List<CustomFieldTemplateFieldDto>
        {
            new(
                FieldKey: "affiliation",
                Label: "Affiliation",
                DataType: CustomFieldDataType.Select,
                Category: "Institutional",
                IsRequired: true,
                DisplayOrder: 1,
                OptionsJson: "[\"Student\",\"Employee/Faculty\",\"Dependent\",\"Guest\"]",
                Placeholder: "Select institutional affiliation",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "student_id",
                Label: "Student ID / LRN",
                DataType: CustomFieldDataType.Text,
                Category: "Student",
                IsRequired: true,
                DisplayOrder: 2,
                OptionsJson: null,
                Placeholder: "e.g. 2026-00412",
                VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}",
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "college",
                Label: "College / Faculty",
                DataType: CustomFieldDataType.Select,
                Category: "Student",
                IsRequired: true,
                DisplayOrder: 3,
                OptionsJson: "[\"College of Engineering and Architecture\",\"College of Information Technology and Computing\",\"College of Science and Mathematics\",\"College of Technology\",\"College of Science and Technology Education\"]",
                Placeholder: "Select college",
                VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}",
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "program",
                Label: "Degree / Academic Program",
                DataType: CustomFieldDataType.Select,
                Category: "Student",
                IsRequired: true,
                DisplayOrder: 4,
                OptionsJson: "[]",
                Placeholder: "Select academic program",
                VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}",
                ConditionalOptionsJson: "{\"parentField\":\"college\",\"mapping\":{\"College of Engineering and Architecture\":[\"BS Civil Engineering\",\"BS Mechanical Engineering\",\"BS Electrical Engineering\",\"BS Architecture\"],\"College of Information Technology and Computing\":[\"BS Information Technology\",\"BS Computer Science\",\"BS Data Science\"],\"College of Science and Mathematics\":[\"BS Applied Mathematics\",\"BS Chemistry\",\"BS Environmental Science\"],\"College of Technology\":[\"Bachelor of Engineering Technology\",\"Automotive Engineering Technology\"],\"College of Science and Technology Education\":[\"BSEd Major in Sciences\",\"BSEd Major in Mathematics\"]},\"defaultOptions\":[]}"
            ),
            new(
                FieldKey: "year_level",
                Label: "Year Level",
                DataType: CustomFieldDataType.Select,
                Category: "Student",
                IsRequired: false,
                DisplayOrder: 5,
                OptionsJson: "[\"1st Year\",\"2nd Year\",\"3rd Year\",\"4th Year\",\"5th Year\",\"Graduate Studies\"]",
                Placeholder: "Select year level",
                VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Student\"}",
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "employee_id",
                Label: "Employee ID",
                DataType: CustomFieldDataType.Text,
                Category: "Employee",
                IsRequired: true,
                DisplayOrder: 6,
                OptionsJson: null,
                Placeholder: "e.g. EMP-2024-889",
                VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Employee/Faculty\"}",
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "department",
                Label: "Department / Office",
                DataType: CustomFieldDataType.Text,
                Category: "Employee",
                IsRequired: false,
                DisplayOrder: 7,
                OptionsJson: null,
                Placeholder: "e.g. Office of Student Affairs, HRMO",
                VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Employee/Faculty\"}",
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "campus_location",
                Label: "Campus Location",
                DataType: CustomFieldDataType.Select,
                Category: "Institutional",
                IsRequired: false,
                DisplayOrder: 8,
                OptionsJson: "[\"Cagayan de Oro (Main)\",\"Claveria\",\"Jasaan\",\"Panaon\",\"Oroquieta\",\"Villanueva\",\"Balubal\"]",
                Placeholder: "Select campus location",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            )
        };

        return new CustomFieldTemplateDto(
            Key: UniversityUstpKey,
            Name: "University / School Clinic (USTP)",
            Description: "Standard higher education health services template with affiliation branching (Student vs Employee/Faculty), cascading College/Program dropdowns, and student/employee IDs.",
            EntityType: "ClinicPatient",
            FieldCount: fields.Count,
            Fields: fields
        );
    }

    private static CustomFieldTemplateDto CreateWorkplaceCorporateTemplate()
    {
        var fields = new List<CustomFieldTemplateFieldDto>
        {
            new(
                FieldKey: "employment_type",
                Label: "Employment Type",
                DataType: CustomFieldDataType.Select,
                Category: "Corporate",
                IsRequired: true,
                DisplayOrder: 1,
                OptionsJson: "[\"Regular\",\"Probationary\",\"Contractor\",\"Consultant\",\"Intern\"]",
                Placeholder: "Select employment classification",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "department",
                Label: "Department / Division",
                DataType: CustomFieldDataType.Text,
                Category: "Corporate",
                IsRequired: true,
                DisplayOrder: 2,
                OptionsJson: null,
                Placeholder: "e.g. Engineering, Sales, Human Resources",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "employee_id",
                Label: "Corporate Employee ID",
                DataType: CustomFieldDataType.Text,
                Category: "Corporate",
                IsRequired: true,
                DisplayOrder: 3,
                OptionsJson: null,
                Placeholder: "e.g. CORP-10492",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "hmo_provider",
                Label: "HMO / Healthcare Provider",
                DataType: CustomFieldDataType.Select,
                Category: "Corporate",
                IsRequired: false,
                DisplayOrder: 4,
                OptionsJson: "[\"Maxicare\",\"Intellicare\",\"Medicard\",\"PhilCare\",\"CareHealth Plus\",\"Cocolife\",\"Other\",\"None\"]",
                Placeholder: "Select HMO provider",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            )
        };

        return new CustomFieldTemplateDto(
            Key: WorkplaceCorporateKey,
            Name: "Workplace / Corporate Health",
            Description: "Corporate occupational health and employee wellness template capturing employment contract status, departmental assignment, employee number, and HMO provider.",
            EntityType: "ClinicPatient",
            FieldCount: fields.Count,
            Fields: fields
        );
    }

    private static CustomFieldTemplateDto CreateGeneralDemographicsTemplate()
    {
        var fields = new List<CustomFieldTemplateFieldDto>
        {
            new(
                FieldKey: "religion",
                Label: "Religion / Faith Affiliation",
                DataType: CustomFieldDataType.Select,
                Category: "Demographics",
                IsRequired: false,
                DisplayOrder: 1,
                OptionsJson: "[\"Roman Catholic\",\"Islam\",\"Iglesia ni Cristo\",\"Evangelical Christian\",\"Seventh-day Adventist\",\"Jehovah's Witnesses\",\"Other\",\"Prefer not to say\"]",
                Placeholder: "Select religious affiliation",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "mothers_maiden_name",
                Label: "Mother's Maiden Name",
                DataType: CustomFieldDataType.Text,
                Category: "Demographics",
                IsRequired: false,
                DisplayOrder: 2,
                OptionsJson: null,
                Placeholder: "e.g. Santos, Maria Reyes",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "spouse_information",
                Label: "Spouse Full Name & Contact",
                DataType: CustomFieldDataType.Text,
                Category: "Demographics",
                IsRequired: false,
                DisplayOrder: 3,
                OptionsJson: null,
                Placeholder: "e.g. Juan Dela Cruz (0917-555-1234)",
                VisibilityRuleJson: "{\"source\":\"static\",\"field\":\"civilStatus\",\"operator\":\"equals\",\"value\":\"Married\"}",
                ConditionalOptionsJson: null
            )
        };

        return new CustomFieldTemplateDto(
            Key: GeneralDemographicsKey,
            Name: "General Clinical Demographics",
            Description: "Extended clinical intake demographics covering cultural/faith beliefs, maternal lineage for identification/validation, and spouse contact conditional on marital status.",
            EntityType: "ClinicPatient",
            FieldCount: fields.Count,
            Fields: fields
        );
    }
}
