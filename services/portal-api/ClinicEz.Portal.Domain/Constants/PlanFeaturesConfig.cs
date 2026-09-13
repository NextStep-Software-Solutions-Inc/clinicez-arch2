using System;
using System.Collections.Generic;

namespace ClinicEz.Portal.Domain.Constants;

public static class SubscriptionPlans
{
    public const string Starter = "starter";
    public const string Pro = "pro";
    public const string Enterprise = "enterprise";
}

public class PlanLimits
{
    public int MaxClinics { get; set; }
    public int MaxStaff { get; set; }
    public int MaxPatients { get; set; }
}

public static class PlanFeaturesConfig
{
    public static readonly Dictionary<string, PlanLimits> Limits = new(StringComparer.OrdinalIgnoreCase)
    {
        {
            SubscriptionPlans.Starter, new PlanLimits
            {
                MaxClinics = 1,
                MaxStaff = 3,
                MaxPatients = 500
            }
        },
        {
            SubscriptionPlans.Pro, new PlanLimits
            {
                MaxClinics = 5,
                MaxStaff = 15,
                MaxPatients = 5000
            }
        },
        {
            SubscriptionPlans.Enterprise, new PlanLimits
            {
                MaxClinics = 9999,
                MaxStaff = 9999,
                MaxPatients = 999999
            }
        }
    };

    public static PlanLimits GetLimitsForPlan(string planId)
    {
        if (string.IsNullOrEmpty(planId) || !Limits.TryGetValue(planId, out var limits))
        {
            // Default fallback if no valid plan
            return Limits[SubscriptionPlans.Starter];
        }
        return limits;
    }
}
