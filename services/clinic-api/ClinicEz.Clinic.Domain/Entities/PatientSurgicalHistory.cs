using System;
using System.ComponentModel.DataAnnotations.Schema;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientSurgicalHistory : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }

    /// <summary>
    /// Name or description of the surgical procedure performed (e.g. "Appendectomy", "Cholecystectomy").
    /// </summary>
    public required string ProcedureName { get; set; }

    public string? ProcedureCode { get; set; }

    /// <summary>
    /// Date when the surgery occurred. Nullable when exact day/month is unknown.
    /// </summary>
    public DateOnly? SurgeryDate { get; set; }

    /// <summary>
    /// Approximate or exact year of surgery when specific DateOnly is not recalled.
    /// </summary>
    public int? SurgeryYear { get; set; }

    public string? BodySite { get; set; }
    public string? Laterality { get; set; }
    public string? SurgeonName { get; set; }
    public string? AnesthesiaType { get; set; }

    /// <summary>
    /// Name of the hospital or surgical facility where the procedure was performed.
    /// </summary>
    public string? HospitalName { get; set; }

    /// <summary>
    /// Operative findings or pathology report notes.
    /// </summary>
    public string? Findings { get; set; }

    /// <summary>
    /// Post-operative complications or sequelae, if any.
    /// </summary>
    public string? Complications { get; set; }

    /// <summary>
    /// General clinical remarks or notes.
    /// </summary>
    public string? Remarks { get; set; }
}
