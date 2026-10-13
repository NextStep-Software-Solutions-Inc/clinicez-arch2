using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// Baseline PhilHealth physical examination and organ systems findings for a patient.
/// Maps to PhilHealth Konsulta PEMISCS (coded findings), PESPECIFIC (remarks), and PEGENSURVEY.
/// </summary>
public sealed class PatientPhysicalExamProfile : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }

    // PEGENSURVEY — General Survey
    public string GenSurveyId { get; set; } = "1";
    public string? GenSurveyRemarks { get; set; }

    // PEMISCS & PESPECIFIC — 8 Statutory PhilHealth Organ Systems

    // 1. Skin / Extremities (lib_skin_extremities)
    public string SkinId { get; set; } = "1";
    public string? SkinRemarks { get; set; }

    // 2. HEENT (lib_heent)
    public string HeentId { get; set; } = "11";
    public string? HeentRemarks { get; set; }

    // 3. Chest / Lungs (lib_chest)
    public string ChestId { get; set; } = "6";
    public string? ChestRemarks { get; set; }

    // 4. Heart (lib_heart)
    public string HeartId { get; set; } = "5";
    public string? HeartRemarks { get; set; }

    // 5. Abdomen (lib_abdomen)
    public string AbdomenId { get; set; } = "7";
    public string? AbdomenRemarks { get; set; }

    // 6. Neurological (lib_neuro)
    public string NeuroId { get; set; } = "6";
    public string? NeuroRemarks { get; set; }

    // 7. Digital Rectal (lib_digital_rectal)
    public string RectalId { get; set; } = "1";
    public string? RectalRemarks { get; set; }

    // 8. Genitourinary (lib_genitourinary)
    public string GuId { get; set; } = "1";
    public string? GuRemarks { get; set; }
}
