using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>Marketing bullet point of a plan (pricing page). Not an entitlement.</summary>
public class PlanFeature : BaseEntity
{
    public Guid PlanId { get; set; }
    public Plan? Plan { get; set; }

    public string Name { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
}
