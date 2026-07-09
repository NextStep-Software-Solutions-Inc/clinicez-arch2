using MainPortalBE.Domain.Common;
using System;

namespace MainPortalBE.Domain.Entities;

public class Tenant : BaseEntity
{
    public string OwnerId { get; set; } = string.Empty;
    public string ClinicName { get; set; } = string.Empty;
    public string TenantSlug { get; set; } = string.Empty;
    public string FacilityType { get; set; } = string.Empty;
    
    // Additional contact info based on registration
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    // Xendit Billing & Subscription State
    public string XenditCustomerId { get; set; } = string.Empty;
    public string SubscriptionId { get; set; } = string.Empty;
    public string SubscriptionStatus { get; set; } = "TRIALING";
    public string SubscriptionPlanId { get; set; } = string.Empty;
}
