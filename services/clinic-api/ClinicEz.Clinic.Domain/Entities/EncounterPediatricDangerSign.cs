using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class EncounterPediatricDangerSign : ClinicScopedEntity
{
    public Guid PediatricMilestoneId { get; set; }
    public EncounterPediatricMilestone PediatricMilestone { get; set; } = null!;

    public PediatricDevelopmentDomain Domain { get; set; }
    public string DangerSignCode { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsPresent { get; set; } = true;
    public string? Remarks { get; set; }
}
