using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

public class SubscriptionPlanFeature : BaseEntity
{
    public Guid SubscriptionPlanId { get; set; }
    public SubscriptionPlan? SubscriptionPlan { get; set; }

    public string Name { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
}
