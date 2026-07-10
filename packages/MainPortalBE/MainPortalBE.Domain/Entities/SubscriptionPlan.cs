using System;
using System.Collections.Generic;
using MainPortalBE.Domain.Common;

namespace MainPortalBE.Domain.Entities;

public class SubscriptionPlan : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal PriceMonthly { get; set; }
    public decimal PriceAnnually { get; set; }
    public bool IsHighlighted { get; set; }
    public bool RequiresCheckout { get; set; }

    public ICollection<SubscriptionPlanFeature> Features { get; set; } = new List<SubscriptionPlanFeature>();
}
