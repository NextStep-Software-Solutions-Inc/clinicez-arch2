using PatientAppBE.Domain.Common;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Domain.Entities;

/// <summary>Provider-administered vaccinations — pushed from Clinic Dashboard, read-only for patient.</summary>
public sealed class VaccinationAdministered : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid? ClinicId { get; set; }

    public string VaccineName { get; set; } = string.Empty;
    public string? DiseaseTargeted { get; set; }
    public string? DoseNumber { get; set; }
    public DateOnly DateAdministered { get; set; }
    public string? LotBatchNumber { get; set; }
    public string? AdministeredBy { get; set; }
    public string? Facility { get; set; }
    public string? Route { get; set; }
    public string? InjectionSite { get; set; }
    public DateOnly? NextDueDate { get; set; }
    public VaccineAdverseReaction? AdverseReaction { get; set; }
    public string? AdverseReactionDescription { get; set; }
    public VaccineProgram? VaccineProgram { get; set; }

    public DateTime? SyncedAt { get; set; }
    public string? ServerId { get; set; }
}
