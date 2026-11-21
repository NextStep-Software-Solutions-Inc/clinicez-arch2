using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class EncounterDiagnosis : ClinicScopedEntity
{
    public Guid ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public required string Icd10Code { get; set; }
    public required string Description { get; set; }
    public bool IsPrimary { get; set; } = false;
}
