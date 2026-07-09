using PatientAppBE.Domain.Common;

namespace PatientAppBE.Domain.Entities;

/// <summary>PhilHealth YAKAP/eKonsulta Physical Examination — HCW-entered, read-only for patient.</summary>
public sealed class PatientPhysicalExamProfile : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid? ClinicId { get; set; }
    public DateOnly ExamDate { get; set; }

    // PEGENSURVEY
    public string? GenSurveyId { get; set; }
    public string? GenSurveyRem { get; set; }

    // PESPECIFIC — free-text findings per system
    public string? SkinRem { get; set; }
    public string? HeentRem { get; set; }
    public string? ChestRem { get; set; }
    public string? HeartRem { get; set; }
    public string? AbdomenRem { get; set; }
    public string? NeuroRem { get; set; }
    public string? RectalRem { get; set; }
    public string? GuRem { get; set; }

    // PEMISCS — space-separated PhilHealth code strings
    public string? SkinId { get; set; }
    public string? HeentId { get; set; }
    public string? ChestId { get; set; }
    public string? HeartId { get; set; }
    public string? AbdomenId { get; set; }
    public string? NeuroId { get; set; }
    public string? GuId { get; set; }
    public string? RectalId { get; set; }

    public DateTime? SyncedAt { get; set; }
    public string? ServerId { get; set; }
}
