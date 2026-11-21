using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientHospitalizationHistory : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string ReasonForAdmission { get; set; } = string.Empty;
    public DateOnly? AdmissionDate { get; set; }
    public DateOnly? DischargeDate { get; set; }
    public int? AdmissionYear { get; set; }

    public string? PrimaryIcd10Code { get; set; }
    public string? HospitalFacilityName { get; set; }
    public string? AttendingPhysicianName { get; set; }
    public string? DischargeDisposition { get; set; }
    public string? ClinicalSummaryNotes { get; set; }
}
