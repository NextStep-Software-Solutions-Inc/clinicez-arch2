namespace ClinicEz.MediaBroker.Application.Common.Options;

public sealed class LiveKitOptions
{
    public const string Section = "LiveKit";

    public string ApiKey { get; set; } = "devkey";
    public string ApiSecret { get; set; } = "secret0123456789abcdef0123456789abcdef";
    public string RelayUrl { get; set; } = "wss://media.clinicez.internal";
}
