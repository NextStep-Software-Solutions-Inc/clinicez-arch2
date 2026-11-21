using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientBpMonitoringLog : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public Guid? ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }

    public decimal? AverageAmSystolic { get; set; }
    public decimal? AverageAmDiastolic { get; set; }
    public decimal? AveragePmSystolic { get; set; }
    public decimal? AveragePmDiastolic { get; set; }
    public decimal? OverallAverageSystolic { get; set; }
    public decimal? OverallAverageDiastolic { get; set; }

    public string? ClinicalInterpretation { get; set; }

    public ICollection<PatientBpMonitoringDay> Days { get; set; } = new List<PatientBpMonitoringDay>();
}
