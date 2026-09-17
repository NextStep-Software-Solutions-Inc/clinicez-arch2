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
    public string PlanTitle { get; set; } = string.Empty;
    public int MaxClinics { get; set; }
    public int MaxStaff { get; set; }
    public int MaxPatients { get; set; }
    public int MonthlyApiQuotaLimit { get; set; } = 10000;
}

public static class PlanFeaturesConfig
{
    public static readonly Dictionary<string, PlanLimits> Limits = new(StringComparer.OrdinalIgnoreCase)
    {
        {
            SubscriptionPlans.Starter, new PlanLimits
            {
                PlanTitle = "Starter Plan",
                MaxClinics = 1,
                MaxStaff = 3,
                MaxPatients = 500,
                MonthlyApiQuotaLimit = 10000
            }
        },
        {
            SubscriptionPlans.Pro, new PlanLimits
            {
                PlanTitle = "Professional Plan",
                MaxClinics = 5,
                MaxStaff = 15,
                MaxPatients = 5000,
                MonthlyApiQuotaLimit = 50000
            }
        },
        {
            SubscriptionPlans.Enterprise, new PlanLimits
            {
                PlanTitle = "Enterprise Plan",
                MaxClinics = 9999,
                MaxStaff = 9999,
                MaxPatients = 999999,
                MonthlyApiQuotaLimit = 1000000
            }
        }
    };

    public static PlanLimits? GetLimitsForPlan(string? planId)
    {
        if (string.IsNullOrEmpty(planId) || !Limits.TryGetValue(planId, out var limits))
        {
            return null;
        }
        return limits;
    }
}
