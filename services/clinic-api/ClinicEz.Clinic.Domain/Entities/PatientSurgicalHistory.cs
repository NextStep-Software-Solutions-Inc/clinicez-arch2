using System;
using System.ComponentModel.DataAnnotations.Schema;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientSurgicalHistory : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }

    /// <summary>
    /// Name or description of the surgical procedure performed (e.g. "Appendectomy", "Cholecystectomy").
    /// </summary>
    public required string ProcedureName { get; set; }

    [NotMapped]
    public string SurgicalProcedureName
    {
        get => ProcedureName;
        set => ProcedureName = value;
    }

    /// <summary>
    /// Date when the surgery occurred.
    /// </summary>
    public DateOnly SurgeryDate { get; set; }

    [NotMapped]
    public DateOnly OperationDate
    {
        get => SurgeryDate;
        set => SurgeryDate = value;
    }

    /// <summary>
    /// Name of the hospital or surgical facility where the procedure was performed.
    /// </summary>
    public string? HospitalName { get; set; }

    [NotMapped]
    public string? FacilityName
    {
        get => HospitalName;
        set => HospitalName = value;
    }

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
