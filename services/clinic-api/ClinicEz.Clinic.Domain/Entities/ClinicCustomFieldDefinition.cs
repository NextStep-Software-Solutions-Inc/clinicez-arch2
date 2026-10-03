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
}
