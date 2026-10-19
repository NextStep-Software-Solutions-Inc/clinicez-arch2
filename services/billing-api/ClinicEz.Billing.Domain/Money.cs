namespace ClinicEz.Billing.Domain;

/// <summary>
/// Money rules. All amounts are <c>decimal(18,2)</c> in the invoice currency (PHP by default).
/// Every computed amount is rounded to 2 decimals half away from zero (so 0.005 becomes 0.01), and rounding
/// happens once per line total, once per percentage discount and once per proportional allocation share,
/// never on a running sum, so the parts always add up to the stored totals.
/// </summary>
public static class Money
{
    public const string DefaultCurrency = "PHP";

    public static decimal Round(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Splits <paramref name="amount"/> over <paramref name="weights"/> proportionally. Each share is rounded down to the cent
    /// and the left-over cents go to the last non-zero weight, so the shares always sum to exactly <paramref name="amount"/>.
    /// </summary>
    public static IReadOnlyList<decimal> Distribute(decimal amount, IReadOnlyList<decimal> weights)
    {
        var total = weights.Sum();
        var shares = new decimal[weights.Count];
        if (total <= 0m || weights.Count == 0) return shares;

        decimal assigned = 0m;
        var lastIndex = -1;
        for (var i = 0; i < weights.Count; i++)
        {
            if (weights[i] <= 0m) continue;
            shares[i] = Math.Floor(amount * weights[i] / total * 100m) / 100m;
            assigned += shares[i];
            lastIndex = i;
        }

        if (lastIndex >= 0) shares[lastIndex] += amount - assigned;
        return shares;
    }
}
