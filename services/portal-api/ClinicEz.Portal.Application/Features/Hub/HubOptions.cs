namespace ClinicEz.Portal.Application.Features.Hub;

/// <summary>Bound from the <c>Hub</c> configuration section.</summary>
public sealed class HubOptions
{
    public const string Section = "Hub";

    /// <summary>Cell that hosts every SharedCloud facility. Must match the cell the cloud hub seeds.</summary>
    public string CloudCellId { get; set; } = FacilityCells.DefaultCloudCellId;

    /// <summary>
    /// Public URL of the cloud hub, handed to on-premise sites as <c>Messaging:HubUrl</c>.
    /// It can differ from the URL portal-api itself uses (<c>Messaging:HubUrl</c>), for example a cluster-internal address.
    /// </summary>
    public string? PublicUrl { get; set; }
}
