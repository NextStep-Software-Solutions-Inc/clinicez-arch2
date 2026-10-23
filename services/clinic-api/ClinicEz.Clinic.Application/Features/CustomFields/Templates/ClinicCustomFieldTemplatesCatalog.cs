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
    public const string PatientIntakeContactsKey = "patient_intake_contacts";
    public const string PatientIntakeAddressKey = "patient_intake_address";
    public const string PatientIntakeEmergencyKey = "patient_intake_emergency";

    private static readonly IReadOnlyList<CustomFieldTemplateDto> _templates = new List<CustomFieldTemplateDto>
    {
        CreateUniversityUstpTemplate(),
        CreateWorkplaceCorporateTemplate(),
        CreateGeneralDemographicsTemplate(),
        CreatePatientIntakeContactsTemplate(),
        CreatePatientIntakeAddressTemplate(),
        CreatePatientIntakeEmergencyTemplate()
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
        var trimmed = key.Trim();
        if (string.Equals(trimmed, "university", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(trimmed, "school_clinic", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = UniversityUstpKey;
        }
        else if (string.Equals(trimmed, "workplace", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(trimmed, "corporate", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = WorkplaceCorporateKey;
        }
        else if (string.Equals(trimmed, "demographics", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(trimmed, "general", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = GeneralDemographicsKey;
        }
        else if (string.Equals(trimmed, "intake", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(trimmed, "patient_intake", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(trimmed, "contacts", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(trimmed, "address_emergency", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(trimmed, "intake_contacts", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = PatientIntakeContactsKey;
        }
        else if (string.Equals(trimmed, "address", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(trimmed, "addresses", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = PatientIntakeAddressKey;
        }
        else if (string.Equals(trimmed, "emergency", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(trimmed, "emergency_contacts", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = PatientIntakeEmergencyKey;
        }
        return _templates.FirstOrDefault(t => string.Equals(t.Key, trimmed, StringComparison.OrdinalIgnoreCase));
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
            Name: "University / School Clinic",
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

    private static CustomFieldTemplateDto CreatePatientIntakeContactsTemplate()
    {
        var fields = new List<CustomFieldTemplateFieldDto>
        {
            // Address (Primary, Secondary)
            new(
                FieldKey: "primary_address_line",
                Label: "Primary Address (House/Unit/Street)",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: true,
                DisplayOrder: 1,
                OptionsJson: null,
                Placeholder: "House/Unit No., Street",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "primary_barangay",
                Label: "Primary Barangay",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 2,
                OptionsJson: null,
                Placeholder: "e.g. Barangay San Antonio, Poblacion",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "primary_city",
                Label: "Primary City / Municipality",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: true,
                DisplayOrder: 3,
                OptionsJson: null,
                Placeholder: "e.g. Cagayan de Oro City, Manila, Cebu City",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "primary_province",
                Label: "Primary Province / Region",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 4,
                OptionsJson: null,
                Placeholder: "e.g. Misamis Oriental, Metro Manila, Cebu",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "primary_postal_code",
                Label: "Primary Postal / ZIP Code",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 5,
                OptionsJson: null,
                Placeholder: "e.g. 9000, 1100",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_address_line",
                Label: "Secondary / Alternative Address",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 6,
                OptionsJson: null,
                Placeholder: "Dormitory, Boarding House, Provincial, or Work Address",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_city_province",
                Label: "Secondary City & Province",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 7,
                OptionsJson: null,
                Placeholder: "City / Municipality, Province",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),

            // Emergency Contacts (with phone number, relationship, and address)
            new(
                FieldKey: "emergency_contact_name",
                Label: "Primary Emergency Contact Name",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: true,
                DisplayOrder: 8,
                OptionsJson: null,
                Placeholder: "Full name of primary emergency contact",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "emergency_contact_relationship",
                Label: "Relationship to Patient",
                DataType: CustomFieldDataType.Select,
                Category: "Emergency Contacts",
                IsRequired: true,
                DisplayOrder: 9,
                OptionsJson: "[\"Parent\",\"Spouse\",\"Child\",\"Sibling\",\"Guardian\",\"Relative\",\"Friend\",\"Workplace Colleague\",\"Other\"]",
                Placeholder: "Select relationship",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "emergency_contact_phone",
                Label: "Emergency Contact Phone Number",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: true,
                DisplayOrder: 10,
                OptionsJson: null,
                Placeholder: "e.g. 0917-123-4567 or (02) 8123-4567",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "emergency_contact_address",
                Label: "Emergency Contact Address",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 11,
                OptionsJson: null,
                Placeholder: "Complete residential or workplace address",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_emergency_contact_name",
                Label: "Secondary Emergency Contact Name",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 12,
                OptionsJson: null,
                Placeholder: "Full name of secondary / backup contact",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_emergency_contact_relationship",
                Label: "Secondary Contact Relationship",
                DataType: CustomFieldDataType.Select,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 13,
                OptionsJson: "[\"Parent\",\"Spouse\",\"Child\",\"Sibling\",\"Guardian\",\"Relative\",\"Friend\",\"Workplace Colleague\",\"Other\"]",
                Placeholder: "Select relationship",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_emergency_contact_phone",
                Label: "Secondary Contact Phone Number",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 14,
                OptionsJson: null,
                Placeholder: "e.g. 0918-987-6543",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_emergency_contact_address",
                Label: "Secondary Contact Address",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 15,
                OptionsJson: null,
                Placeholder: "Complete residential or workplace address",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            )
        };

        return new CustomFieldTemplateDto(
            Key: PatientIntakeContactsKey,
            Name: "Patient Intake: Address & Emergency Contacts",
            Description: "Standard patient intake template with Primary and Secondary Addresses, plus Primary and Secondary Emergency Contacts including phone number, relationship, and physical address.",
            EntityType: "ClinicPatient",
            FieldCount: fields.Count,
            Fields: fields
        );
    }

    private static CustomFieldTemplateDto CreatePatientIntakeAddressTemplate()
    {
        var fields = new List<CustomFieldTemplateFieldDto>
        {
            new(
                FieldKey: "primary_address_line",
                Label: "Primary Address (House/Unit/Street)",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: true,
                DisplayOrder: 1,
                OptionsJson: null,
                Placeholder: "House/Unit No., Street",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "primary_barangay",
                Label: "Primary Barangay",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 2,
                OptionsJson: null,
                Placeholder: "e.g. Barangay San Antonio, Poblacion",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "primary_city",
                Label: "Primary City / Municipality",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: true,
                DisplayOrder: 3,
                OptionsJson: null,
                Placeholder: "e.g. Cagayan de Oro City, Manila, Cebu City",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "primary_province",
                Label: "Primary Province / Region",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 4,
                OptionsJson: null,
                Placeholder: "e.g. Misamis Oriental, Metro Manila, Cebu",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "primary_postal_code",
                Label: "Primary Postal / ZIP Code",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 5,
                OptionsJson: null,
                Placeholder: "e.g. 9000, 1100",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_address_line",
                Label: "Secondary / Alternative Address",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 6,
                OptionsJson: null,
                Placeholder: "Dormitory, Boarding House, Provincial, or Work Address",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_city_province",
                Label: "Secondary City & Province",
                DataType: CustomFieldDataType.Text,
                Category: "Address",
                IsRequired: false,
                DisplayOrder: 7,
                OptionsJson: null,
                Placeholder: "City / Municipality, Province",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            )
        };

        return new CustomFieldTemplateDto(
            Key: PatientIntakeAddressKey,
            Name: "Patient Intake: Addresses (Primary & Secondary)",
            Description: "Intake addresses template providing primary and secondary address lines, city/municipality, province, and postal code.",
            EntityType: "ClinicPatient",
            FieldCount: fields.Count,
            Fields: fields
        );
    }

    private static CustomFieldTemplateDto CreatePatientIntakeEmergencyTemplate()
    {
        var fields = new List<CustomFieldTemplateFieldDto>
        {
            new(
                FieldKey: "emergency_contact_name",
                Label: "Primary Emergency Contact Name",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: true,
                DisplayOrder: 1,
                OptionsJson: null,
                Placeholder: "Full name of primary emergency contact",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "emergency_contact_relationship",
                Label: "Relationship to Patient",
                DataType: CustomFieldDataType.Select,
                Category: "Emergency Contacts",
                IsRequired: true,
                DisplayOrder: 2,
                OptionsJson: "[\"Parent\",\"Spouse\",\"Child\",\"Sibling\",\"Guardian\",\"Relative\",\"Friend\",\"Workplace Colleague\",\"Other\"]",
                Placeholder: "Select relationship",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "emergency_contact_phone",
                Label: "Emergency Contact Phone Number",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: true,
                DisplayOrder: 3,
                OptionsJson: null,
                Placeholder: "e.g. 0917-123-4567 or (02) 8123-4567",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "emergency_contact_address",
                Label: "Emergency Contact Address",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 4,
                OptionsJson: null,
                Placeholder: "Complete residential or workplace address",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_emergency_contact_name",
                Label: "Secondary Emergency Contact Name",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 5,
                OptionsJson: null,
                Placeholder: "Full name of backup contact person",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_emergency_contact_relationship",
                Label: "Secondary Contact Relationship",
                DataType: CustomFieldDataType.Select,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 6,
                OptionsJson: "[\"Parent\",\"Spouse\",\"Child\",\"Sibling\",\"Guardian\",\"Relative\",\"Friend\",\"Workplace Colleague\",\"Other\"]",
                Placeholder: "Select relationship",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_emergency_contact_phone",
                Label: "Secondary Contact Phone Number",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 7,
                OptionsJson: null,
                Placeholder: "e.g. 0918-987-6543",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            ),
            new(
                FieldKey: "secondary_emergency_contact_address",
                Label: "Secondary Contact Address",
                DataType: CustomFieldDataType.Text,
                Category: "Emergency Contacts",
                IsRequired: false,
                DisplayOrder: 8,
                OptionsJson: null,
                Placeholder: "Complete residential or workplace address",
                VisibilityRuleJson: null,
                ConditionalOptionsJson: null
            )
        };

        return new CustomFieldTemplateDto(
            Key: PatientIntakeEmergencyKey,
            Name: "Patient Intake: Emergency Contacts",
            Description: "Intake emergency contacts template capturing primary and secondary emergency contacts with phone numbers, relationships, and physical addresses.",
            EntityType: "ClinicPatient",
            FieldCount: fields.Count,
            Fields: fields
        );
    }
}
