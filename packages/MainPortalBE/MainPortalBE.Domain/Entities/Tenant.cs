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

    // Contact & Address Details (Xendit Mapping)
    public string? PhoneNumber { get; set; }
    public string? Country { get; set; }
    public string? StreetLine1 { get; set; }
    public string? StreetLine2 { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string? PostalCode { get; set; }

    // Business Details (Xendit Mapping)
    public string? TradingName { get; set; }
    public string? BusinessType { get; set; }
    public string? TaxId { get; set; }
}
