using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientPhysicalExam : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public Guid? ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public DateTime ExamDate { get; set; } = DateTime.UtcNow;
    public Guid? ExaminedByStaffId { get; set; }
    public string? ExaminedByStaffName { get; set; }

    public GeneralSurveyStatus GeneralSurveyStatus { get; set; } = GeneralSurveyStatus.Normal;
    public string GeneralSurveyCodes { get; set; } = "1";
    public string? GeneralSurveyRemarks { get; set; }
    public string? CbeRemarks { get; set; }

    public string? SkinRemarks { get; set; }
    public string? HeentRemarks { get; set; }
    public string? ChestLungsRemarks { get; set; }
    public string? HeartRemarks { get; set; }
    public string? AbdomenRemarks { get; set; }
    public string? NeurologicalRemarks { get; set; }
    public string? DigitalRectalRemarks { get; set; }
    public string? GenitourinaryRemarks { get; set; }
    public string? MusculoskeletalRemarks { get; set; }
    public string? PsychiatricRemarks { get; set; }
    public string? LymphaticRemarks { get; set; }

    public string? GenSurveyId { get; set; }
    public string? SkinId { get; set; }
    public string? HeentId { get; set; }
    public string? ChestId { get; set; }
    public string? HeartId { get; set; }
    public string? AbdomenId { get; set; }
    public string? NeuroId { get; set; }
    public string? RectalId { get; set; }
    public string? GuId { get; set; }

    public ICollection<PatientPhysicalExamFinding> Findings { get; set; } = new List<PatientPhysicalExamFinding>();
}
