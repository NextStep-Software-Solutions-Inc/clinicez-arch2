using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Workspace-scoped teleconsultation pay-as-you-go billing settings, 1:1 with <see cref="Tenant"/>.
/// Controls opt-in enablement, billing mode (Prepaid vs Postpaid), per-minute rates, allocated budgets,
/// prepaid credit balance, and period usage counters.
/// </summary>
public class WorkspaceTeleconsultBilling : BaseEntity
{
    public const decimal DefaultRatePerMinutePhp = 5.00m;
    public const string ModePrepaid = "Prepaid";
    public const string ModePostpaid = "Postpaid";

    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    /// <summary>Whether video teleconsultation is enabled for this workspace (strictly false by default).</summary>
    public bool IsEnabled { get; set; } = false;

    /// <summary>Billing mode: "Prepaid" (credit balance required) or "Postpaid" (metered invoice).</summary>
    public string BillingMode { get; set; } = ModePostpaid;

    /// <summary>Platform billing rate in PHP per billable minute (default: ₱5.00/min).</summary>
    public decimal RatePerMinutePhp { get; set; } = DefaultRatePerMinutePhp;

    /// <summary>Explicit monthly cost allocation/budget cap for the workspace in PHP (0 = uncapped).</summary>
    public decimal AllocatedBudgetPhp { get; set; } = 0m;

    /// <summary>Available prepaid balance in PHP for Prepaid mode.</summary>
    public decimal PrepaidBalancePhp { get; set; } = 0m;

    /// <summary>
    /// For Postpaid: whether calls exceeding AllocatedBudgetPhp continue and bill as overage.
    /// For Prepaid: whether calls exceeding balance can overdraft (typically false; running calls protected).
    /// </summary>
    public bool AllowOverageBeyondAllocation { get; set; } = true;

    /// <summary>Current billing period in "yyyy-MM" format (e.g. "2026-11").</summary>
    public string CurrentPeriodYearMonth { get; set; } = DateTime.UtcNow.ToString("yyyy-MM");

    /// <summary>Total call minutes used in the current period.</summary>
    public int CurrentPeriodMinutesUsed { get; set; } = 0;

    /// <summary>Total standard usage billed in PHP during current period.</summary>
    public decimal CurrentPeriodBilledPhp { get; set; } = 0m;

    /// <summary>Total overage usage billed in PHP beyond allocation during current period.</summary>
    public decimal CurrentPeriodOveragePhp { get; set; } = 0m;

    /// <summary>Computes estimated remaining minutes available in the current period.</summary>
    public int ComputeAvailableMinutes()
    {
        if (!IsEnabled || RatePerMinutePhp <= 0m) return 0;

        if (string.Equals(BillingMode, ModePrepaid, StringComparison.OrdinalIgnoreCase))
        {
            return (int)Math.Floor(PrepaidBalancePhp / RatePerMinutePhp);
        }

        if (AllocatedBudgetPhp > 0m)
        {
            var remainingBudget = Math.Max(0m, AllocatedBudgetPhp - CurrentPeriodBilledPhp);
            return (int)Math.Floor(remainingBudget / RatePerMinutePhp);
        }

        // Uncapped postpaid
        return int.MaxValue;
    }

    /// <summary>Advances the billing period counters when entering a new calendar month.</summary>
    public void RollPeriodIfNeeded(string targetYearMonth)
    {
        if (CurrentPeriodYearMonth != targetYearMonth)
        {
            CurrentPeriodYearMonth = targetYearMonth;
            CurrentPeriodMinutesUsed = 0;
            CurrentPeriodBilledPhp = 0m;
            CurrentPeriodOveragePhp = 0m;
        }
    }
}
