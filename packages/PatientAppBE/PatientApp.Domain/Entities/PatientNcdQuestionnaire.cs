using PatientApp.Domain.Common;

namespace PatientApp.Domain.Entities;

/// <summary>PhilHealth YAKAP/eKonsulta NCD risk questionnaire — HCW-entered, read-only for patient.</summary>
public sealed class PatientNcdQuestionnaire : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    // Q1–Q18: Y/N or Y/N/X answers
    public string? Qid1Yn { get; set; }
    public string? Qid2Yn { get; set; }
    public string? Qid3Yn { get; set; }
    public string? Qid4Yn { get; set; }
    public string? Qid5Ynx { get; set; }
    public string? Qid6Yn { get; set; }
    public string? Qid7Yn { get; set; }
    public string? Qid8Yn { get; set; }
    public string? Qid9Yn { get; set; }
    public string? Qid10Yn { get; set; }
    public string? Qid11Yn { get; set; }
    public string? Qid12Yn { get; set; }
    public string? Qid13Yn { get; set; }
    public string? Qid14Yn { get; set; }
    public string? Qid15Yn { get; set; }
    public string? Qid16Yn { get; set; }
    public string? Qid17Abcde { get; set; }
    public string? Qid18Yn { get; set; }

    // Q19 — Fasting Blood Sugar
    public string? Qid19Yn { get; set; }
    public decimal? Qid19FbsMgdl { get; set; }
    public decimal? Qid19FbsMmol { get; set; }
    public DateOnly? Qid19FbsDate { get; set; }

    // Q20 — Cholesterol
    public string? Qid20Yn { get; set; }
    public decimal? Qid20CholeVal { get; set; }
    public DateOnly? Qid20CholeDate { get; set; }

    // Q21 — Urine Ketones
    public string? Qid21Yn { get; set; }
    public decimal? Qid21KetonVal { get; set; }
    public DateOnly? Qid21KetonDate { get; set; }

    // Q22 — Urine Protein
    public string? Qid22Yn { get; set; }
    public decimal? Qid22ProteinVal { get; set; }
    public DateOnly? Qid22ProteinDate { get; set; }

    public string? Qid23Yn { get; set; }
    public string? Qid24Yn { get; set; }

    public DateTime? SyncedAt { get; set; }
    public string? ServerId { get; set; }
}
