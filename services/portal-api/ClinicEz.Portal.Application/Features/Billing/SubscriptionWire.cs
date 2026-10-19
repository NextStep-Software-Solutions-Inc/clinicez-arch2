using ClinicEz.Portal.Domain.Entities;

namespace ClinicEz.Portal.Application.Features.Billing;

/// <summary>The upper-case status spelling the admin and billing screens have always received.</summary>
public static class SubscriptionWire
{
    public const string NoPlan = "None";

    public static string Status(SubscriptionStatus status) => status switch
    {
        SubscriptionStatus.PastDue => "PAST_DUE",
        _ => status.ToString().ToUpperInvariant()
    };
}
