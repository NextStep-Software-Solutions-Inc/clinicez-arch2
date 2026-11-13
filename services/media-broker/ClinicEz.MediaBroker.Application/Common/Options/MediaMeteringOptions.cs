namespace ClinicEz.MediaBroker.Application.Common.Options;

/// <summary>
/// Configuration options governing call admission metering and default tenant entitlement provisioning.
/// </summary>
public sealed class MediaMeteringOptions
{
    public const string Section = "MediaMetering";

    public bool AutoProvisionDefaultEntitlement { get; set; } = false;
    public int DefaultCallMinutesMonthly { get; set; } = 1000;
    public bool DefaultAllowOverdraft { get; set; } = true;
    public bool DefaultAllowTransportOnlyFallback { get; set; } = true;
}
