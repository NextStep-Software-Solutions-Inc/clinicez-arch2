using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientBpMonitoringDay : ClinicScopedEntity
{
    public Guid BpMonitoringLogId { get; set; }
    public PatientBpMonitoringLog BpMonitoringLog { get; set; } = null!;

    public int DayNumber { get; set; } // 1..7
    public DateOnly MeasurementDate { get; set; }
    public string LocationCode { get; set; } = "02"; // LIB-053: 01 Clinic, 02 Home
    public bool TakenAfterMedication { get; set; } = false;

    public int? AmSystolic { get; set; }
    public int? AmDiastolic { get; set; }
    public int? AmHeartRate { get; set; }

    public int? PmSystolic { get; set; }
    public int? PmDiastolic { get; set; }
    public int? PmHeartRate { get; set; }

    public string? Remarks { get; set; }
}
