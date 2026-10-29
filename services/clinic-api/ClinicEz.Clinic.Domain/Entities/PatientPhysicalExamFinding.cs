using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientPhysicalExamFinding : ClinicScopedEntity
{
    public Guid PhysicalExamId { get; set; }
    public PatientPhysicalExam PhysicalExam { get; set; } = null!;

    public PhysicalExamSystem System { get; set; }
    public bool IsNormal { get; set; } = true;

    public string FindingTitle { get; set; } = string.Empty;

    public string? PhilHealthFindingCode { get; set; }
    public string? BodySite { get; set; }
    public string? Laterality { get; set; }
    public string? Remarks { get; set; }
}
