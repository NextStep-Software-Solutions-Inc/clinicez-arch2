using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public enum CustomFieldDataType
{
    Text,
    Number,
    Date,
    Select,
    Boolean
}

public sealed class ClinicCustomFieldDefinition : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    /// <summary>
    /// Target entity, e.g. "ClinicPatient"
    /// </summary>
    public string EntityType { get; set; } = "ClinicPatient";

    /// <summary>
    /// Machine key, e.g. "student_id", "college", "program", "year_level", "employee_id"
    /// </summary>
    public required string FieldKey { get; set; }

    /// <summary>
    /// UI label, e.g. "Student ID / LRN", "College / Department"
    /// </summary>
    public required string Label { get; set; }

    public CustomFieldDataType DataType { get; set; } = CustomFieldDataType.Text;

    /// <summary>
    /// Applicable category: "All", "Student", "Employee"
    /// </summary>
    public string? Category { get; set; }

    public bool IsRequired { get; set; } = false;
    public int DisplayOrder { get; set; } = 0;

    /// <summary>
    /// JSON array for Select options, e.g. ["1st Year", "2nd Year", "3rd Year", "4th Year"]
    /// </summary>
    public string? OptionsJson { get; set; }

    public string? Placeholder { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// JSON structure defining dynamic visibility rules based on static entity fields or preceding custom fields.
    /// Format:
    /// {
    ///   "source": "custom_field", // or "static"
    ///   "field": "affiliation",    // or "gender", "civilStatus", "dateOfBirth"
    ///   "operator": "equals",      // "equals", "not_equals", "in", "contains", "not_empty"
    ///   "value": "Student"
    /// }
    /// </summary>
    public string? VisibilityRuleJson { get; set; }

    /// <summary>
    /// JSON structure defining cascading/dependent select options based on parent field selection.
    /// Format:
    /// {
    ///   "parentField": "college",
    ///   "mapping": {
    ///     "College of Engineering": ["BS Civil Engineering", "BS Mechanical Engineering"],
    ///     "College of Information Technology": ["BS Computer Science", "BS Information Technology"]
    ///   },
    ///   "defaultOptions": []
    /// }
    /// </summary>
    public string? ConditionalOptionsJson { get; set; }

    /// <summary>
    /// For Date fields: boundary constraint mode ("pastOrToday", "futureOrToday", "futureOnly", "any").
    /// Nullable, defaults to null (which resolves in UI/validator according to category rules).
    /// </summary>
    public string? BoundaryMode { get; set; }
}
